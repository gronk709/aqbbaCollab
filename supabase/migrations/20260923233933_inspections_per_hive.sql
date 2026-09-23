-- ============================================================================
-- Re-scopes inspections from the apiary down to a single hive. Until now
-- one inspection covered a batch of hives (inspection_hives, many-to-many)
-- with one shared set of scores applied to all of them -- which never
-- really matched what the scores mean: Productivity, Mite Count, Chalkbrood
-- etc. are properties of one colony, not something a group of hives can
-- share a single value for. Requested explicitly after the last real test
-- hive (Y0001) was deleted; confirmed on production before writing this
-- that both `hives` and `inspections` are empty, so there's no batch data
-- to split across hives.
--
-- inspections.hive_id (not null) replaces apiary_id entirely -- the apiary
-- is always derived via hive -> apiary now, so the two can never disagree
-- the way a stored, separately-editable apiary_id could. inspection_hives
-- is dropped outright, not just emptied.
-- ============================================================================

drop table public.inspection_hives;

drop policy inspections_insert on public.inspections;

drop index inspections_apiary_idx;

alter table public.inspections
  add column hive_id text not null references public.hives(id) on delete cascade,
  drop column apiary_id;

create index inspections_hive_idx on public.inspections (hive_id, occurred_on desc);

-- Same 'operate'-or-better gate as before, just resolved through the hive
-- being inspected instead of a column stored directly on the row.
create policy inspections_insert on public.inspections
  for insert to authenticated with check (
    exists (
      select 1 from public.hives h
      where h.id = hive_id and public.can_operate_apiary(h.apiary_id)
    )
  );
