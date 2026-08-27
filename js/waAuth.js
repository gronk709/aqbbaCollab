/* ==========================================================================
   Wild Apricot OAuth.

   This module builds and consumes the parts of the authorization-code flow
   that are safe to run in a browser: the redirect to Wild Apricot's login,
   parsing what it sends back, and — once SUPABASE_CONFIG and WA_CONFIG.
   clientId below are filled in — calling the server-side piece that
   exchanges the code for a token. That exchange itself needs the
   application's client secret, which must never reach a browser, so it
   runs in a Supabase Edge Function instead: see
   supabase/functions/wildapricot-auth/index.ts.

   Until WA_CONFIG.clientId is filled in below, everything here stays
   dormant and js/views/gate.js keeps using its simulated sign-in — nothing
   about the current demo changes on its own.

   --------------------------------------------------------------------------
   Setup checklist:

   1. Sign in to the AQBBA Wild Apricot site as Administrator.
   2. Settings → find "API" (older admin: Settings → Global settings → API;
      newer admin: Settings → API/Integrations — Wild Apricot has moved this
      before, so search "API" in settings if it's not where this says).
   3. Under Authorized applications, create a new application.
      - Application type: the one described as reading a *single logged-in
        contact's own data* (WA calls this a "Contact-level access" or
        "Server-side" app depending on version) — NOT the account-wide API
        key, which authenticates as the whole organisation rather than one
        member.
      - Redirect URI: must exactly match WA_CONFIG.redirectUri below,
        including trailing slash and http vs https. This has to be revisited
        once real hosting exists — a localhost URI only works for you,
        testing locally; production needs the real deployed URL added here
        (WA allows multiple redirect URIs per application).
   4. Copy the Client ID (public — fine to put in this file, WA_CONFIG.
      clientId below) and Client Secret (never put this in frontend code or
      this repo — set it as a Supabase secret instead, see step 6).
   5. Fill in SUPABASE_CONFIG below with the project's URL and anon key
      (Supabase dashboard → Project Settings → API — both are public/safe
      in frontend code, unlike the service role key).
   6. Deploy the Edge Function and set its secrets:
        supabase functions deploy wildapricot-auth
        supabase secrets set WA_CLIENT_ID=<client id> WA_CLIENT_SECRET=<client secret>
   -------------------------------------------------------------------------- */

export const WA_CONFIG = {
  /* Fill in after completing the setup checklist above. */
  clientId: 'AQBBACollab',
  /* Must exactly match a redirect URI registered on the WA application.
     window.location.origin means "wherever this is actually running" —
     fine for now, but pin this to a real URL once hosting is chosen, since
     it must be in WA's allow-list before login will work. */
  redirectUri: `${window.location.origin}/`,
  authorizeUrl: 'https://oauth.wildapricot.org/auth/login',
  /* "contacts_me" scopes the token to the logged-in member's own record —
     the right scope for member self-service. Broader scopes (e.g. "contacts"
     for reading the full directory) would need explaining to members during
     consent and aren't needed for anything built so far. */
  scope: 'contacts_me',
};

export const SUPABASE_CONFIG = {
  url: 'https://dtzegdvjgzmlhtjlzzyp.supabase.co',
  /* Public anon key — safe in frontend code, distinct from the service
     role key which must never leave server-side environment variables.
     Supabase dashboard → Project Settings → API. */
  anonKey: '',
};

export const isConfigured = () => Boolean(WA_CONFIG.clientId);

const STATE_KEY = 'aqbba.wa.oauth_state';

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Sends the browser to Wild Apricot's login page. The state value is a CSRF
   guard: WA hands it back unchanged, and startWildApricotLogin's caller
   confirms it matches what was stored here before trusting the callback. */
export function startWildApricotLogin() {
  if (!isConfigured()) {
    throw new Error('WA_CONFIG.clientId is not set — see the setup checklist at the top of js/waAuth.js.');
  }
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);

  const url = new URL(WA_CONFIG.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', WA_CONFIG.clientId);
  url.searchParams.set('redirect_uri', WA_CONFIG.redirectUri);
  url.searchParams.set('scope', WA_CONFIG.scope);
  url.searchParams.set('state', state);
  window.location.href = url.toString();
}

/* True if this page load is Wild Apricot redirecting back with a result —
   i.e. the URL's query string (not hash) carries ?code= or ?error=. Check
   this on boot, before the router looks at the hash. */
export function isWildApricotCallback() {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') || params.has('error');
}

/* Parses and validates the callback, then scrubs the query string so a
   reload doesn't replay a used (and by then invalid) code. Returns
   { code } on success, or { error } if WA reported one or state didn't
   match — the latter means the redirect wasn't really from the login flow
   this tab started, so it's rejected rather than trusted. */
export function consumeWildApricotCallback() {
  const params = new URLSearchParams(window.location.search);
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState(null, '', clean);

  const error = params.get('error');
  if (error) return { error: params.get('error_description') || error };

  const code = params.get('code');
  const state = params.get('state');
  if (!code) return { error: 'No authorization code in the callback URL.' };
  if (!expected || state !== expected) return { error: 'Login response did not match this browser session — please try signing in again.' };

  return { code };
}

/* Exchanges `code` for a signed-in member's identity by calling the
   Supabase Edge Function that holds the client secret — see
   supabase/functions/wildapricot-auth/index.ts for what actually happens
   server-side (token exchange, then fetching the member's own Wild Apricot
   contact record). Throws if SUPABASE_CONFIG isn't filled in yet, or if the
   function call itself fails; js/app.js's boot-time caller catches this and
   toasts the failure rather than leaving the page stuck.

   Returns { waContactId, name, email, membershipLevel, roles } — the shape
   js/store.js's signInAsWildApricotMember expects. */
export async function completeWildApricotLogin(code) {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    throw new Error('SUPABASE_CONFIG is not set — see the setup checklist at the top of js/waAuth.js.');
  }

  const res = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/wildapricot-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
      apikey: SUPABASE_CONFIG.anonKey,
    },
    body: JSON.stringify({ code, redirectUri: WA_CONFIG.redirectUri }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Sign-in failed.');
  return body;
}
