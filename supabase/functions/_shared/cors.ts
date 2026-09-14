/* Shared CORS headers for AQBBA's Edge Functions. Restricted to known
   origins now that real hosting exists — the deployed production site plus
   localhost so `python3 serve.py` keeps working for local development and
   testing. Add a new origin here (e.g. a custom domain, or a Vercel preview
   URL you want to test against) rather than reopening this to '*'. */
const ALLOWED_ORIGINS = [
  'https://aqbba-collab.vercel.app',
  'http://localhost:4173',
];

export function corsHeadersFor(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}
