-- ============================================================================
-- Adds a fifth VSH-program assessment score to inspections: Brood Pattern,
-- alongside Productivity/Temperament/Vigour/Hygiene (20260923000000). Same
-- shape exactly -- optional per inspection, 1-5, 5 = best.
-- ============================================================================

alter table public.inspections
  add column brood_pattern int check (brood_pattern between 1 and 5);
