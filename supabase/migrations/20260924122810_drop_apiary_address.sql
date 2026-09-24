-- ============================================================================
-- Drops apiaries.address entirely -- requested for real, deliberate reasons:
-- an exact street address for a research apiary is a security risk this
-- association doesn't want to carry at all (site theft/vandalism), not just
-- a field worth hiding from the UI. Region (already a separate, coarser
-- column) is judged sufficient as a general identifier.
--
-- Confirmed on production before writing this: all four real apiaries
-- already have address = null (whatever GPS coordinates this column
-- carried over from the original Phase 5 migration are already gone), so
-- this drops zero real data.
-- ============================================================================

alter table public.apiaries drop column address;
