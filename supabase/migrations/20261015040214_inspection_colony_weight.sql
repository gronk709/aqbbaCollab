-- ============================================================================
-- Adds colony weight (kg) as an optional inspection measurement, alongside
-- mite_count/ubeeo_pct/etc. (20260923221430) -- same "nullable, no default"
-- shape: an inspection that never weighed the colony records nothing, rather
-- than a 0 that would read as a real result.
--
-- numeric(5,1): hive scales read to the nearest 0.1 kg, and Postgres rounds
-- anything finer to that on insert. A colony can't weigh nothing, so unlike
-- the mite count the check starts above 0; 500 kg is a generous ceiling
-- (a full multi-box colony on a pallet scale is well under it) that still
-- catches a typo or a unit mix-up (grams, pounds).
--
-- No policy or grant changes: inspections' existing table-level RLS and
-- grants already cover a new column, so who can log or read an inspection
-- is unchanged.
-- ============================================================================

alter table public.inspections
  add column weight_kg numeric(5,1) check (weight_kg > 0 and weight_kg <= 500);

comment on column public.inspections.weight_kg is
  'Colony weight at the time of the inspection, in kilograms (0.1 kg resolution). Null = not weighed.';
