-- ============================================================================
-- Adds "new" as a hive status: a new colony currently undergoing setup. Like
-- "retired" and "critical", this only widens the two allowed-value lists -- a
-- hive's own status, and the optional status an inspection can set on it.
-- ============================================================================

alter table public.hives
  drop constraint hives_status_check,
  add constraint hives_status_check
    check (status in ('new', 'thriving', 'good', 'average', 'poor', 'critical', 'treating', 'retired'));

alter table public.inspections
  drop constraint inspections_resulting_status_check,
  add constraint inspections_resulting_status_check
    check (resulting_status in ('new', 'thriving', 'good', 'average', 'poor', 'critical', 'treating', 'retired'));
