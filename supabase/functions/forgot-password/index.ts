/* ==========================================================================
   Forgot password (js/views/gate.js's "Forgot password?" link) — public,
   unauthenticated by design, same shape as wildapricot-auth: called with
   only the anon key (which is itself a valid JWT, so verify_jwt still
   passes), since nobody asking to reset a password is signed in yet.

   RLS blocks every read of members/member_contact_details for a signed-out
   session, so there's no client-side way to tell whether an email belongs
   to a Wild-Apricot-linked member (wa_contact_id set) before deciding what
   to do — that lookup has to happen here, server-side, with the service
   role key.

   A Wild-Apricot-linked member's auth.users row (created by wildapricot-
   auth's admin.createUser) never has a password set at all — they only
   ever sign in via the WA OAuth → magiclink exchange server-side. Sending
   one of them a working recovery link would hand them a second, parallel
   way to authenticate that bypasses Wild Apricot entirely — exactly what
   this project's role model assumes can't happen (see identity_and_auth_
   bridge.sql's own comments on why roles are deliberately not derived from
   Wild Apricot). So: if the email matches a member with wa_contact_id set,
   this refuses to send anything and says so — js/views/gate.js shows that
   as a "manage your password through Wild Apricot" dialog and stops there.
   That's this app's own product decision, not a security requirement
   Supabase itself imposes.

   Otherwise (a direct/collaborator account, or no matching member at all),
   this calls supabaseAdmin.auth.resetPasswordForEmail(), which is already
   safe against email enumeration on its own — it resolves the same way
   whether or not a matching auth user actually exists, only sending mail
   when one does. That's why this function's own response never says
   whether the account exists either; the only thing it discloses is the
   Wild-Apricot-vs-not distinction the product explicitly wants surfaced.

   Returns { method: 'wildapricot' } or { method: 'email' }, or a non-2xx
   response with { error } for a malformed request.

   No new secrets needed — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
   already auto-injected into every Edge Function's environment, same as
   wildapricot-auth.

   Deploy:
     supabase functions deploy forgot-password
   -------------------------------------------------------------------------- */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ALLOWED_ORIGINS, corsHeadersFor } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let payload: { email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const email = (payload.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email is required.' }, 400);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Is this email a Wild-Apricot-linked member? If so, stop here —
    // see the header comment above for why no email gets sent at all.
    const contactMatch = await supabaseAdmin
      .from('member_contact_details')
      .select('member_id')
      .ilike('email', email)
      .maybeSingle();
    if (contactMatch.error) throw contactMatch.error;

    if (contactMatch.data) {
      const member = await supabaseAdmin
        .from('members')
        .select('wa_contact_id')
        .eq('id', contactMatch.data.member_id)
        .single();
      if (member.error) throw member.error;
      if (member.data.wa_contact_id) return json({ method: 'wildapricot' });
    }

    // 2. Direct/collaborator account (or no match at all) — ask Supabase to
    // send its own recovery email. redirectTo must be one of this project's
    // known origins — never an arbitrary client-supplied URL, that would be
    // an open redirect (same guard as invite-collaborator's own).
    const origin = req.headers.get('origin');
    const redirectOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const reset = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectOrigin}/`,
    });
    if (reset.error) throw reset.error;

    return json({ method: 'email' });
  } catch (err) {
    console.error('Unexpected error requesting a password reset:', err);
    return json({ error: 'Unexpected error processing that request.' }, 500);
  }
});
