-- ============================================================================
-- Expands inspections with biosecurity/disease assessment fields, and drops
-- Hygiene -- requested together. Zero inspections exist in production yet
-- (confirmed before writing this), so dropping hygiene loses no real data.
--
-- Percentages (ubeeo_pct, pkd_pct) and mite_count are plain optional
-- integers, same "nullable, no default" shape the 1-5 scores already use --
-- unlike those, 0 is a real, meaningful result for these three (a mite wash
-- that found zero mites is not "not recorded"), so the client never
-- collapses 0 to null the way `|| null` would (see js/store.js's
-- addInspection).
--
-- nosema_present/wax_moth_present are nullable booleans, not `not null
-- default false` -- the tri-state (assessed-and-absent vs never-assessed)
-- matters the same way it does for the numeric scores; a boolean that
-- defaults to false would silently claim "assessed, not found" for every
-- inspection nobody actually checked.
-- ============================================================================

alter table public.inspections
  drop column hygiene,
  add column mite_count       int check (mite_count between 0 and 100000),
  add column ubeeo_pct        int check (ubeeo_pct between 0 and 100),
  add column pkd_pct          int check (pkd_pct between 0 and 100),
  add column chalkbrood       int check (chalkbrood between 1 and 5),
  add column sacbrood         int check (sacbrood between 1 and 5),
  add column efb              int check (efb between 1 and 5),
  add column shb              int check (shb between 1 and 5),
  add column nosema_present   boolean,
  add column wax_moth_present boolean,
  add column viruses          text;
