/* ==========================================================================
   Invite a non–Wild Apricot collaborator — Web Admin-only.

   Some real contributors (outside research collaborators, etc.) aren't
   paying Wild Apricot members and shouldn't need to become one just to use
   this site — buying them a WA license seat isn't the point. This function
   lets a Web Admin provision a `members` row directly and have Supabase
   email that person a real "set your password" invite, entirely independent
   of Wild Apricot. Once accepted, that member is completely ordinary from
   every other table's point of view (RLS, roles, everything keys off
   `current_member_id()`/`auth_user_id`, never `wa_contact_id`) — the only
   difference is `wa_contact_id` stays null forever for this row.

   Called by inviteCollaborator({ name, email, roles }) in js/store.js, with
   the caller's own Supabase access token in the Authorization header (their
   normal signed-in session — NOT the anon key, unlike wildapricot-auth,
   which is unauthenticated by design since Wild Apricot itself is the proof
   of identity there). This function's own job is to independently verify,
   server-side, that the caller really is a Web Admin — see step 1 below.
   Never trust a client-supplied "I'm an admin" claim; BUGS.md already has
   one open finding (notify-subscribers) about a function that trusted
   client-supplied identity instead of deriving it from the verified JWT —
   this function must not repeat that mistake.

   On success: creates members + member_contact_details + member_roles for
   the new collaborator, then supabaseAdmin.auth.admin.inviteUserByEmail(...)
   — which creates their auth.users row and sends Supabase's own "you've
   been invited" email. That link redirects back to this site with
   #access_token=...&type=invite in the URL hash (Supabase's standard
   email-link redirect shape) — see js/inviteAuth.js for how the client
   picks that up, and js/views/setPassword.js for what happens next.

   Returns { ok: true } on success, or a non-2xx response with { error }.

   No new secrets needed — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
   already auto-injected into every Edge Function's environment, same as
   wildapricot-auth.

   Deploy:
     supabase functions deploy invite-collaborator
   -------------------------------------------------------------------------- */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ALLOWED_ORIGINS, corsHeadersFor } from '../_shared/cors.ts';

function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3) || '?';
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const callerJwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerJwt) return json({ error: 'Missing Authorization header.' }, 401);

  let payload: { name?: string; email?: string; roles?: string[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const name = (payload.name || '').trim();
  const email = (payload.email || '').trim();
  const roles = Array.isArray(payload.roles) ? [...new Set(payload.roles)] : [];

  if (!name) return json({ error: 'Name is required.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email is required.' }, 400);
  if (!roles.length) return json({ error: 'At least one role is required.' }, 400);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Verify the caller is a real, currently signed-in Web Admin — never
    // trust anything the client claims about itself. This is the only
    // authorization check that matters; everything below assumes it held.
    const callerAuth = await supabaseAdmin.auth.getUser(callerJwt);
    if (callerAuth.error || !callerAuth.data.user) {
      return json({ error: 'Not signed in.' }, 401);
    }

    const callerMember = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', callerAuth.data.user.id)
      .maybeSingle();
    if (callerMember.error) throw callerMember.error;
    if (!callerMember.data) return json({ error: 'No member record linked to this account.' }, 403);

    const callerRole = await supabaseAdmin
      .from('member_roles')
      .select('member_id')
      .eq('member_id', callerMember.data.id)
      .eq('role_name', 'Web Admin')
      .maybeSingle();
    if (callerRole.error) throw callerRole.error;
    if (!callerRole.data) return json({ error: 'Only Web Admin can invite collaborators.' }, 403);

    // 2. Validate the requested roles are real ones (defence in depth — the
    // member_roles FK would also reject an unknown role, but this gives a
    // clearer error).
    const roleCheck = await supabaseAdmin.from('role_options').select('name').in('name', roles);
    if (roleCheck.error) throw roleCheck.error;
    const validRoles = new Set((roleCheck.data || []).map((r) => r.name));
    const unknownRoles = roles.filter((r) => !validRoles.has(r));
    if (unknownRoles.length) return json({ error: `Unknown role(s): ${unknownRoles.join(', ')}` }, 400);

    // 3. Resolve-or-create the members row for this email, same pattern as
    // wildapricot-auth's own find-or-provision logic.
    let member: { id: string; auth_user_id: string | null } | null = null;

    const contactMatch = await supabaseAdmin
      .from('member_contact_details')
      .select('member_id')
      .ilike('email', email)
      .maybeSingle();
    if (contactMatch.error) throw contactMatch.error;

    if (contactMatch.data) {
      const existing = await supabaseAdmin
        .from('members')
        .select('id, auth_user_id')
        .eq('id', contactMatch.data.member_id)
        .single();
      if (existing.error) throw existing.error;
      member = existing.data;
    }

    if (member && member.auth_user_id) {
      return json({ error: 'This email already has sign-in access.' }, 409);
    }

    if (!member) {
      const created = await supabaseAdmin
        .from('members')
        .insert({ name, initials: initialsOf(name) })
        .select('id, auth_user_id')
        .single();
      if (created.error) throw created.error;
      member = created.data;

      const contactInsert = await supabaseAdmin
        .from('member_contact_details')
        .insert({ member_id: member.id, email });
      if (contactInsert.error) throw contactInsert.error;
    }

    const roleInserts = await supabaseAdmin
      .from('member_roles')
      .upsert(
        roles.map((role_name) => ({ member_id: member!.id, role_name, granted_by: callerMember.data.id })),
        { onConflict: 'member_id,role_name' },
      );
    if (roleInserts.error) throw roleInserts.error;

    // 4. Create the auth user and email them the invite. redirectTo must be
    // one of this project's known origins — never an arbitrary client-
    // supplied URL, that would be an open redirect.
    const origin = req.headers.get('origin');
    const redirectOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${redirectOrigin}/`,
    });
    if (invited.error) throw invited.error;

    const linked = await supabaseAdmin
      .from('members')
      .update({ auth_user_id: invited.data.user.id })
      .eq('id', member.id);
    if (linked.error) throw linked.error;

    return json({ ok: true });
  } catch (err) {
    console.error('Unexpected error inviting collaborator:', err);
    return json({ error: 'Unexpected error sending the invite.' }, 500);
  }
});
