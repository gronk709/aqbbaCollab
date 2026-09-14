/* ==========================================================================
   Supabase client — the single shared connection every view/store module
   uses to talk to Postgres, once an entity has migrated off js/data.js.

   SUPABASE_CONFIG lives here rather than duplicated in js/waAuth.js (which
   used to hold its own copy for the Edge Function call) — both the auth
   bridge and every future table read/write share one project. Values are
   the project URL and anon key, both public/safe in frontend code per
   Supabase dashboard → Project Settings → API — never put the service role
   key here or anywhere in this repo.

   No bundler in this project, so the client library comes from Supabase's
   own ESM CDN build rather than an npm install — same zero-build approach
   as the rest of the app. That CDN fetch is done lazily, inside
   getSupabase(), rather than as a top-level `import` — a top-level import
   here would make every page load's module graph depend on a third-party
   CDN even before any view actually reads or writes a table, which is
   exactly the kind of hard boot dependency this app doesn't have today.
   getSupabase() is only called once Phase 1+ code that actually needs a
   table exists.
   -------------------------------------------------------------------------- */

export const SUPABASE_CONFIG = {
  url: 'https://dtzegdvjgzmlhtjlzzyp.supabase.co',
  anonKey: 'sb_publishable_K6Sv_hrNXzSdn0gbCyXzYg_uEZoSqju',
};

let clientPromise = null;

/* Lazily creates (once) and returns the shared client. Call sites that need
   it should be async and expect this to occasionally reject — e.g. the CDN
   being unreachable — same failure mode as any other network call, handled
   the normal way (toast + leave the UI as it was) rather than crashing boot. */
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
      .then(({ createClient }) => createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey));
  }
  return clientPromise;
}
