-- ============================================================================
-- Adds a free-text weather note to an inspection (e.g. "Sunny, 22C, light
-- wind"). Optional, like the other measurements: null means none recorded.
-- varchar(40) so the database itself enforces the 40-character limit, not
-- only the form. No policy or grant changes: inspections' table-level ones
-- already cover a new column.
-- ============================================================================

alter table public.inspections
  add column weather varchar(40);

comment on column public.inspections.weather is
  'Weather at the time of the inspection, free text, at most 40 characters. Null = not recorded.';
