/* ==========================================================================
   Email-link auth callbacks: collaborator invites and password-reset
   recovery links.

   Mirrors js/waAuth.js's shape, but for Supabase's own email-based auth
   links instead of Wild Apricot's OAuth redirect. Both
   supabase.auth.admin.inviteUserByEmail (supabase/functions/invite-
   collaborator) and supabase.auth.resetPasswordForEmail (supabase/
   functions/forgot-password) send an email whose link redirects back here
   with the new session's tokens in the URL HASH —
   #access_token=...&refresh_token=...&type=invite (or type=recovery) —
   which is Supabase's standard shape for every email-based auth link (magic
   link, invite, recovery), independent of anything set client-side. The
   two are told apart by that `type` value alone; the token handling below
   is otherwise identical, so both pairs of exports share one implementation.

   That's a problem specifically in this app because the router is itself
   hash-based (#/members etc.) — so this has to be detected and stripped
   before the hash router ever looks at location.hash, the same way
   js/waAuth.js's ?code= callback is checked before the router runs, just
   reading the query string instead. js/supabaseClient.js disables
   supabase-js's own detectSessionInUrl so nothing races this manual
   handling.

   Unlike the Wild Apricot path, no server round trip is needed here —
   Supabase already minted real tokens before sending the email, so this
   just hands them straight to supabase.auth.setSession(), exactly like
   completeWildApricotLogin does with what its Edge Function returns. */

function parseHashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export function isInviteAuthCallback() {
  const params = parseHashParams();
  return params.get('type') === 'invite' && params.has('access_token');
}

export function isPasswordRecoveryCallback() {
  const params = parseHashParams();
  return params.get('type') === 'recovery' && params.has('access_token');
}

/* Extracts the tokens and scrubs the hash so a reload doesn't try to
   reprocess an already-consumed link. Returns { access_token, refresh_token }
   on success, or { error } if the hash didn't actually carry what the
   is*Callback() check expected. */
function consumeEmailAuthTokens(linkNoun) {
  const params = parseHashParams();
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  const error = params.get('error_description') || params.get('error');
  if (error) return { error };

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return { error: `${linkNoun} link is missing its sign-in tokens.` };

  return { access_token, refresh_token };
}

export function consumeInviteAuthCallback() {
  return consumeEmailAuthTokens('Invite');
}

export function consumePasswordRecoveryCallback() {
  return consumeEmailAuthTokens('Password reset');
}
