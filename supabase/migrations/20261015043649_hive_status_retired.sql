-- ============================================================================
-- Adds "retired" as a sixth hive status: a colony withdrawn from assessment.
-- The app hides retired hives from every apiary view (they stay in the table,
-- with their inspection history, and are listed by the Retired hives report),
-- so this only widens the two allowed-value lists: the hive's own status, and
-- the optional status an inspection can set on its hive.
-- ============================================================================

alter table public.hives
  drop constraint hives_status_check,
  add constraint hives_status_check
    check (status in ('thriving', 'good', 'average', 'poor', 'treating', 'retired'));

alter table public.inspections
  drop constraint inspections_resulting_status_check,
  add constraint inspections_resulting_status_check
    check (resulting_status in ('thriving', 'good', 'average', 'poor', 'treating', 'retired'));
