/* Shared CORS headers for AQBBA's Edge Functions. Origin is wide open for
   now since there's no production domain yet — tighten this to the real
   deployed origin once hosting is chosen (see README → "Hosting & backend"). */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
