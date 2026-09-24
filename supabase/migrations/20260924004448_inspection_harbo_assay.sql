-- ============================================================================
-- Adds Harbo Assay as an inspection assessment field, alongside
-- Chalkbrood/Sacbrood/EFB/SHB (20260923221430) -- same optional-int shape,
-- but scored 1-4 rather than 1-5 (the Harbo assay's own scale), 4 = best.
-- ============================================================================

alter table public.inspections
  add column harbo_assay int check (harbo_assay between 1 and 4);
