-- ============================================================================
-- Adds "critical" as a hive status: the colony is near failure. Like
-- "retired" (20261015043649), this only widens the two allowed-value lists --
-- a hive's own status, and the optional status an inspection can set on it.
-- ============================================================================

alter table public.hives
  drop constraint hives_status_check,
  add constraint hives_status_check
    check (status in ('thriving', 'good', 'average', 'poor', 'critical', 'treating', 'retired'));

alter table public.inspections
  drop constraint inspections_resulting_status_check,
  add constraint inspections_resulting_status_check
    check (resulting_status in ('thriving', 'good', 'average', 'poor', 'critical', 'treating', 'retired'));
