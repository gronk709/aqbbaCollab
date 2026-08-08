/* ==========================================================================
   Wild Apricot OAuth — groundwork only.

   This module builds and consumes the parts of the authorization-code flow
   that are safe to run in a browser: the redirect to Wild Apricot's login,
   and parsing what it sends back. It deliberately does NOT exchange the
   returned code for a token — that step requires the application's client
   secret, which must never reach a browser, so it has to run on a server
   that doesn't exist yet (see README → "Wiring up the real integrations").

   Until WA_CONFIG.clientId is filled in below, everything here stays
   dormant and js/views/gate.js keeps using its simulated sign-in — nothing
   about the current demo changes on its own.

   --------------------------------------------------------------------------
   Setup checklist (do this in the Wild Apricot admin panel first):

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
   4. Copy the Client ID (public — fine to put in this file) and Client
      Secret (never put this in frontend code — it belongs only in the
      future server-side token exchange).
   -------------------------------------------------------------------------- */

export const WA_CONFIG = {
  /* Fill in after completing the setup checklist above. */
  clientId: '',
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

/* --------------------------------------------------------------------------
   Deliberately not implemented here: exchanging `code` for an access token.
   That's a server-side call —

     POST https://oauth.wildapricot.org/auth/token
     Authorization: Basic base64(client_id:client_secret)
     Content-Type: application/x-www-form-urlencoded
     grant_type=authorization_code&code=<code>&redirect_uri=<redirectUri>

   — followed by, using the returned access_token:

     GET https://api.wildapricot.org/v2.2/accounts/{accountId}/contacts/me

   to fetch the signed-in member's own contact record. Once hosting exists,
   that pair of calls lives in one server endpoint (e.g. an API route), and
   completeWildApricotLogin(code) below is what would call it:

   export async function completeWildApricotLogin(code) {
     const res = await fetch('/api/auth/wildapricot', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ code, redirectUri: WA_CONFIG.redirectUri }),
     });
     if (!res.ok) throw new Error('Sign-in failed.');
     return res.json(); // the member record store.js's signIn() would use
   }
   -------------------------------------------------------------------------- */
