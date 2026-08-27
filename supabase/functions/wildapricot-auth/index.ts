/* ==========================================================================
   Wild Apricot OAuth — server-side half.

   The piece js/waAuth.js explicitly can't do in a browser: exchanging an
   authorization code for an access token, which requires WA_CLIENT_SECRET.
   See js/waAuth.js's header comment and README → "Wiring up the real
   integrations" for the setup checklist this depends on (the Authorized
   Application must already exist in the Wild Apricot admin).

   Called by completeWildApricotLogin(code) in js/waAuth.js with
   { code, redirectUri }. Returns, on success:

     { waContactId, name, email, membershipLevel, roles }

   — the shape js/store.js's signInAsWildApricotMember expects. On failure,
   a non-2xx response with { error }.

   Deploy:
     supabase functions deploy wildapricot-auth

   Secrets (set once — never put these in this file or the repo):
     supabase secrets set WA_CLIENT_ID=... WA_CLIENT_SECRET=...

   -------------------------------------------------------------------------
   Membership-level → role mapping is a PLACEHOLDER below. AQBBA's real Wild
   Apricot membership level names aren't known yet — replace the keys in
   MEMBERSHIP_LEVEL_TO_ROLES with the real ones from the Wild Apricot admin
   (Settings → Membership levels) once available. Any level not listed
   falls back to DEFAULT_ROLES rather than failing sign-in, so an unmapped
   level never locks someone out — it just under-grants them until the
   mapping (or their roles directly, via the roles editor) is corrected.
   -------------------------------------------------------------------------- */

import { corsHeaders } from '../_shared/cors.ts';

const WA_TOKEN_URL = 'https://oauth.wildapricot.org/auth/token';
const WA_API_BASE = 'https://api.wildapricot.org/v2.2';

const MEMBERSHIP_LEVEL_TO_ROLES: Record<string, string[]> = {
  // PLACEHOLDER — e.g. 'Full Member': ['Breeder'], 'Committee': ['Web Admin']
};
const DEFAULT_ROLES = ['Member'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
        redirect_uri: redirectUri,
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

    const membershipLevel = contact.MembershipLevel?.Name ?? null;
    const roles = (membershipLevel && MEMBERSHIP_LEVEL_TO_ROLES[membershipLevel]) || DEFAULT_ROLES;

    return json({
      waContactId: contact.Id,
      name: contact.DisplayName || `${contact.FirstName ?? ''} ${contact.LastName ?? ''}`.trim() || 'New member',
      email: contact.Email ?? null,
      membershipLevel,
      roles,
    });
  } catch (err) {
    console.error('Unexpected error during Wild Apricot sign-in:', err);
    return json({ error: 'Unexpected error during sign-in.' }, 500);
  }
});
