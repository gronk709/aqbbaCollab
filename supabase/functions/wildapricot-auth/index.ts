/* ==========================================================================
   Wild Apricot OAuth — server-side half, plus the Supabase auth bridge.

   Two things a browser can't do, both handled here: exchanging an
   authorization code for a Wild Apricot access token (needs
   WA_CLIENT_SECRET), and minting a real Supabase session for whichever
   `members` row that Wild Apricot contact resolves to (needs the service
   role key, so RLS can be bypassed just long enough to look up/provision
   that row). See js/waAuth.js's header comment and README → "Wiring up the
   real integrations" for the setup checklist this depends on.

   Called by completeWildApricotLogin(code) in js/waAuth.js with
   { code, redirectUri }. Returns, on success:

     { access_token, refresh_token, name }

   The client calls supabase.auth.setSession({ access_token, refresh_token })
   with these — see js/waAuth.js and js/store.js (loadSignedInMember)
   for the client side of this. `name` is only for the immediate "Welcome,
   X" toast; once the session is set, the client re-reads the member's own
   row (RLS-protected) as the source of truth for everything else — roles,
   contact details, etc. — rather than trusting anything this function said
   about them. On failure: a non-2xx response with { error }.

   Deploy:
     supabase functions deploy wildapricot-auth

   Secrets (set once — never put these in this file or the repo):
     supabase secrets set WA_CLIENT_ID=... WA_CLIENT_SECRET=...

   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY do NOT need to be set as
   secrets — Supabase injects both automatically into every Edge Function's
   environment.

   -------------------------------------------------------------------------
   The auth bridge, step by step, once the Wild Apricot token exchange and
   contacts/me fetch below have produced { waContactId, name, email }:

     1. Look up members by wa_contact_id (the stable key from every sign-in
        after the first).
     2. If no match and an email came back, fall back to a case-insensitive
        match against member_contact_details.email, and backfill
        wa_contact_id onto that row — this is what lets a Web Admin
        pre-provision a member (e.g. importing the WA roster with just a
        name + email) before that person has ever signed in, and also what
        resolves this project's one seeded fallback identity (Pete Czeti)
        to the same row a real sign-in.
     3. If still no match, auto-provision a new members row — this is a
        genuinely new member Wild Apricot knows about that nobody has
        entered here yet — with the DEFAULT_ROLES below. Every real
        sign-in gets DEFAULT_ROLES, deliberately not derived from Wild
        Apricot Membership Level or Group: Membership Level is a fee tier,
        unrelated to what someone should be able to do on this site;
        Groups are general-purpose org bundling that doesn't map cleanly
        onto these roles either. Roles are assigned deliberately afterward
        via the roles editor (js/views/managers.js) instead.
     4. If that row has no auth_user_id yet, create the Supabase auth user
        (admin.createUser) and store its id there. This only happens once
        per member, ever.
     5. Mint a real session for that auth user via admin.generateLink +
        verifyOtp — the standard workaround for bridging a non-Supabase-
        native OAuth provider into a real Supabase session, since Wild
        Apricot login can't hand Supabase a password or its own OIDC token.
   ------------------------------------------------------------------------- */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const WA_TOKEN_URL = 'https://oauth.wildapricot.org/auth/token';
const WA_API_BASE = 'https://api.wildapricot.org/v2.2';
/* Must match WA_CONFIG.scope in js/waAuth.js — the token request has to
   echo the same scope used in the initial authorize redirect. */
const WA_SCOPE = 'contacts_me';

const DEFAULT_ROLES = ['Member'];

function initialsOf(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3) || '?';
}

/* Finds an existing auth.users row by email — only reached if a member row
   somehow ended up with no auth_user_id despite an auth user for their
   email already existing (e.g. a previous run created the auth user but
   crashed before saving its id back to members). listUsers has no email
   filter in the JS client, so this pages through — fine at this
   association's scale (tens to low hundreds of members, not thousands). */
async function findAuthUserByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let payload: { code?: string; redirectUri?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const { code, redirectUri } = payload;
  if (!code || !redirectUri) return json({ error: 'Missing code or redirectUri.' }, 400);

  const clientId = Deno.env.get('WA_CLIENT_ID');
  const clientSecret = Deno.env.get('WA_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    console.error('WA_CLIENT_ID / WA_CLIENT_SECRET not set — see this function\'s header comment.');
    return json({ error: 'Server is not configured with Wild Apricot credentials.' }, 500);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Exchange the authorization code for an access token.
    const tokenRes = await fetch(WA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: WA_SCOPE,
      }),
    });
    if (!tokenRes.ok) {
      console.error('WA token exchange failed:', tokenRes.status, await tokenRes.text());
      return json({ error: 'Wild Apricot rejected the authorization code.' }, 401);
    }
    const token = await tokenRes.json();

    // The token response's Permissions array names which account this
    // token is scoped to — needed for the contacts/me call below. If this
    // shape doesn't match what Wild Apricot actually returns, check the
    // logged response against WA's current API docs; the exact field name
    // has moved before.
    const accountId = token.Permissions?.[0]?.AccountId;
    if (!accountId) {
      console.error('WA token response had no Permissions[0].AccountId:', JSON.stringify(token));
      return json({ error: 'Could not determine the Wild Apricot account from the token response.' }, 502);
    }

    // 2. Fetch the signed-in member's own contact record.
    const contactRes = await fetch(`${WA_API_BASE}/accounts/${accountId}/contacts/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!contactRes.ok) {
      console.error('WA contacts/me failed:', contactRes.status, await contactRes.text());
      return json({ error: 'Could not read the member record from Wild Apricot.' }, 502);
    }
    const contact = await contactRes.json();

    const waContactId = String(contact.Id);
    const name = contact.DisplayName || `${contact.FirstName ?? ''} ${contact.LastName ?? ''}`.trim() || 'New member';
    const email: string | null = contact.Email ?? null;

    // Every path below ends in generateLink/verifyOtp (step 5), which needs
    // a real email — checked up front, before any DB writes, rather than
    // only where a new member row happens to get created.
    if (!email) {
      return json({
        error: 'Your Wild Apricot contact record has no email address on file, so sign-in can\'t be completed. Ask your Web Admin to add one in Wild Apricot.',
      }, 422);
    }

    // 3. Resolve (or provision) the members row for this contact.
    let member: { id: string; auth_user_id: string | null } | null = null;

    const byWaContactId = await supabaseAdmin
      .from('members')
      .select('id, auth_user_id')
      .eq('wa_contact_id', waContactId)
      .maybeSingle();
    if (byWaContactId.error) throw byWaContactId.error;
    member = byWaContactId.data;

    if (!member) {
      const contactMatch = await supabaseAdmin
        .from('member_contact_details')
        .select('member_id')
        .ilike('email', email)
        .maybeSingle();
      if (contactMatch.error) throw contactMatch.error;

      if (contactMatch.data) {
        const backfilled = await supabaseAdmin
          .from('members')
          .update({ wa_contact_id: waContactId })
          .eq('id', contactMatch.data.member_id)
          .select('id, auth_user_id')
          .single();
        if (backfilled.error) throw backfilled.error;
        member = backfilled.data;
      }
    }

    if (!member) {
      const created = await supabaseAdmin
        .from('members')
        .insert({ wa_contact_id: waContactId, name, initials: initialsOf(name) })
        .select('id, auth_user_id')
        .single();
      if (created.error) throw created.error;
      member = created.data;

      const contactInsert = await supabaseAdmin
        .from('member_contact_details')
        .insert({ member_id: member.id, email });
      if (contactInsert.error) throw contactInsert.error;

      const roleInserts = await supabaseAdmin
        .from('member_roles')
        .insert(DEFAULT_ROLES.map((role_name) => ({ member_id: member!.id, role_name })));
      if (roleInserts.error) throw roleInserts.error;
    }

    // 4. Ensure a Supabase auth user exists and is linked to this member.
    if (!member.auth_user_id) {
      let authUserId: string;
      const createdUser = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
      if (createdUser.error) {
        const existing = await findAuthUserByEmail(supabaseAdmin, email);
        if (!existing) throw createdUser.error;
        authUserId = existing.id;
      } else {
        authUserId = createdUser.data.user.id;
      }

      const linked = await supabaseAdmin
        .from('members')
        .update({ auth_user_id: authUserId })
        .eq('id', member.id);
      if (linked.error) throw linked.error;
      member.auth_user_id = authUserId;
    }

    // 5. Mint a real Supabase session for that auth user.
    const link = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (link.error) throw link.error;

    const verified = await supabaseAdmin.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.data.properties.hashed_token,
    });
    if (verified.error) throw verified.error;
    if (!verified.data.session) {
      throw new Error('Verifying the sign-in link did not return a session.');
    }

    return json({
      access_token: verified.data.session.access_token,
      refresh_token: verified.data.session.refresh_token,
      name,
    });
  } catch (err) {
    console.error('Unexpected error during Wild Apricot sign-in:', err);
    return json({ error: 'Unexpected error during sign-in.' }, 500);
  }
});
