-- ============================================================================
-- Phase 5 of the backend migration: apiaries, hives, inspections — the last
-- major entity still on mock data (js/data.js + js/store.js's localStorage
-- patches). Queen lines/breeders (Phase 4) stays mock; nothing here depends
-- on it migrating too, so hives.queen_line stays a plain unconstrained
-- column for now, same as apiary_managers.apiary_id was left before this
-- migration (see below).
--
-- Finishes what Phase 1 started: apiary_managers (identity_and_auth_bridge.
-- sql) was created early, with `apiary_id uuid not null` and no FK, and its
-- access_level check ('manage'/'operate') already models a distinction
-- ('manage' = create/edit/delete hives + edit the apiary; 'operate' =
-- update hives + log inspections, no create/delete) that the client-side
-- canEditApiary() has always been a flat boolean and never actually
-- enforced. This migration adds `apiaries`, wires up the FK, and enforces
-- that split for real via can_manage_apiary()/can_operate_apiary().
--
-- Purge decision, same reasoning as Phase 2/3/6: the three apiaries
-- themselves (Tambo Crossing, Barrowfield, Oradale) are real association
-- research sites, not illustrative example content, so they carry over
-- intact below. Their hives and inspections, however, are entirely
-- RNG-fabricated by js/data.js's buildHives()/inspectionPlan (random
-- statuses, VSH scores, mite loads, note text) to make the prototype look
-- populated — not real records of anything — so those do NOT carry over.
-- Every apiary starts with zero hives and zero inspections in production,
-- same as marketplace/forum started with zero real listings/threads.
--
-- Two column changes on the seed apiary fields, requested alongside this
-- migration: `coords` (lat/long string) is renamed `address` — the seed
-- values are carried over as-is (still GPS coordinates, the only location
-- data that actually existed) since dropping real information for no
-- reason would be worse than a Web Admin later editing it to a proper
-- street address via the Edit apiary form. `established` (a bare int year)
-- becomes a real `date_established date` — seed values become Jan 1 of
-- that year, since only the year was ever recorded. A new `date_removed`
-- (null while active) gives apiaries the same soft-delete shape
-- `members.deactivated_at` already has, for decommissioning a site without
-- breaking anything that still links to it (e.g. a project's sites list).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.apiaries (
  id               text primary key,   -- 'ap-tambo' — matches projects.sites' existing jsonb references, no rewrite needed there
  code             text not null unique,
  name             text not null,
  region           text not null,
  address          text,
  stage            text not null check (stage in ('establishing', 'assessment', 'maintenance', 'requeening')),
  date_established date,
  date_removed     date,   -- null while active; soft-delete, same shape as members.deactivated_at
  flora            text,
  brief            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.hives (
  id                     text primary key,   -- e.g. 'TMB-105', member-chosen; the PK itself now enforces uniqueness instead of only a client-side check
  apiary_id              text not null references public.apiaries(id) on delete cascade,
  status                 text not null check (status in ('thriving', 'good', 'average', 'poor', 'treating')),
  queen_line             text,   -- queen line code (e.g. 'BRW-14') — no FK yet, queen_lines isn't real until Phase 4; add one then, same precedent this migration follows for apiary_managers.apiary_id
  queen_id               text,
  queen_colour           text check (queen_colour in ('white', 'yellow', 'red', 'green', 'blue')),
  queen_year             int,
  vsh                    int check (vsh between 0 and 100),
  mite_load              numeric(5, 1) check (mite_load >= 0),
  hive_configuration     text,   -- freeform; the real add/edit hive forms already collect this as text, not the number js/data.js's seed generator fabricated
  treatment_free_seasons int not null default 0,
  comment                text check (char_length(comment) <= 200),
  last_inspected_at      timestamptz,   -- replaces the mock's stored "days since" int, which only ever rots — computed at render time instead (relDays(), js/data.js)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index hives_apiary_idx on public.hives (apiary_id);

create table public.inspections (
  id               uuid primary key default gen_random_uuid(),
  apiary_id        text not null references public.apiaries(id) on delete cascade,
  kind             text not null check (kind in ('Assessment', 'Maintenance', 'Biosecurity')),
  inspector_id     uuid not null references public.members(id),   -- "Conducted by"
  resulting_status text check (resulting_status in ('thriving', 'good', 'average', 'poor', 'treating')),
  -- VSH-program assessment scores, 1-5 (5 = best); optional per inspection.
  productivity     int check (productivity between 1 and 5),
  temperament      int check (temperament between 1 and 5),
  vigour           int check (vigour between 1 and 5),
  hygiene          int check (hygiene between 1 and 5),
  note             text,
  done             boolean not null default false,
  occurred_on      date not null,
  created_at       timestamptz not null default now()
);

create index inspections_apiary_idx on public.inspections (apiary_id, occurred_on desc);

-- Normalizes the mock's hiveIds array into real rows, so "which hives did
-- this inspection cover" has actual referential integrity instead of a
-- plain array of strings nothing checks.
create table public.inspection_hives (
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  hive_id       text not null references public.hives(id) on delete cascade,
  primary key (inspection_id, hive_id)
);

-- ----------------------------------------------------------------------------
-- Finish what Phase 1 started: apiary_managers.apiary_id was left as a bare
-- uuid with no FK, since apiaries didn't exist yet. It's confirmed empty in
-- production (nothing has ever written a real grant to it), so retyping it
-- is free — except Postgres won't retype a column an existing policy
-- depends on, and member_contact_select (Phase 1) joins two
-- apiary_managers rows on apiary_id (the "co-manages an apiary with them"
-- contact-visibility rule). Drop it, retype, add the FK, then recreate the
-- exact same policy — no logical change, just re-declaring it so the
-- dependency is on the new column type.
-- ----------------------------------------------------------------------------

drop policy member_contact_select on public.member_contact_details;

alter table public.apiary_managers alter column apiary_id type text using apiary_id::text;
alter table public.apiary_managers add constraint apiary_managers_apiary_id_fkey
  foreign key (apiary_id) references public.apiaries(id) on delete cascade;

create policy member_contact_select on public.member_contact_details
  for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.is_web_admin()
    or exists (
      select 1
      from public.apiary_managers me
      join public.apiary_managers them on them.apiary_id = me.apiary_id
      where me.member_id = public.current_member_id()
        and them.member_id = member_contact_details.member_id
    )
  );

-- touch_updated_at() already exists (Phase 1) — reuse it rather than
-- redefine the same trigger function again.
create trigger apiaries_touch_updated_at before update on public.apiaries
  for each row execute function public.touch_updated_at();
create trigger hives_touch_updated_at before update on public.hives
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Helper functions — exact shape of project_access_level/
-- can_contribute_project/can_manage_project (Phase 6), just against
-- apiary_managers and its own tier names ('manage'/'operate' rather than
-- 'manage'/'contribute').
-- ----------------------------------------------------------------------------

create function public.apiary_access_level(p_apiary_id text, p_member_id uuid default public.current_member_id())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access_level from public.apiary_managers
  where apiary_id = p_apiary_id and member_id = p_member_id;
$$;

-- Operate-or-better: Web Admin, or assigned 'manage'/'operate' on this
-- specific apiary. Gates updating a hive and logging an inspection.
create function public.can_operate_apiary(p_apiary_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_web_admin() or public.apiary_access_level(p_apiary_id) in ('manage', 'operate');
$$;

-- Manage-or-better: Web Admin, or assigned 'manage' on this specific
-- apiary. Gates creating/deleting a hive and editing the apiary itself.
create function public.can_manage_apiary(p_apiary_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_web_admin() or public.apiary_access_level(p_apiary_id) = 'manage';
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.apiaries         enable row level security;
alter table public.hives            enable row level security;
alter table public.inspections      enable row level security;
alter table public.inspection_hives enable row level security;

-- apiaries: broadly readable; create/update/delete Web-Admin-only, same as
-- projects — a research site isn't created ad hoc, and matches today's UI
-- (only Web Admin sees "Add apiary").
create policy apiaries_select on public.apiaries
  for select to authenticated using (true);
create policy apiaries_insert on public.apiaries
  for insert to authenticated with check (public.is_web_admin());
create policy apiaries_update on public.apiaries
  for update to authenticated using (public.is_web_admin()) with check (public.is_web_admin());
create policy apiaries_delete on public.apiaries
  for delete to authenticated using (public.is_web_admin());

-- hives: broadly readable; create/delete need 'manage'-or-better, update
-- needs 'operate'-or-better — the actual mechanism behind "operate can
-- update hives but not create or delete them."
create policy hives_select on public.hives
  for select to authenticated using (true);
create policy hives_insert on public.hives
  for insert to authenticated with check (public.can_manage_apiary(apiary_id));
create policy hives_update on public.hives
  for update to authenticated
  using (public.can_operate_apiary(apiary_id))
  with check (public.can_operate_apiary(apiary_id));
create policy hives_delete on public.hives
  for delete to authenticated using (public.can_manage_apiary(apiary_id));

-- inspections/inspection_hives: broadly readable; insert needs
-- 'operate'-or-better on the apiary being inspected. No update/delete
-- policy for authenticated at all — an inspection is an append-only
-- factual record, same shape as notifications, and matches how the mock
-- UI never offered editing or deleting a logged inspection either.
create policy inspections_select on public.inspections
  for select to authenticated using (true);
create policy inspections_insert on public.inspections
  for insert to authenticated with check (public.can_operate_apiary(apiary_id));

create policy inspection_hives_select on public.inspection_hives
  for select to authenticated using (true);
create policy inspection_hives_insert on public.inspection_hives
  for insert to authenticated with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id and public.can_operate_apiary(i.apiary_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on public.apiaries         to authenticated;
grant select, insert, update, delete on public.hives             to authenticated;
grant select, insert                 on public.inspections       to authenticated;
grant select, insert                 on public.inspection_hives  to authenticated;

grant execute on function public.apiary_access_level(text, uuid) to authenticated;
grant execute on function public.can_operate_apiary(text)        to authenticated;
grant execute on function public.can_manage_apiary(text)         to authenticated;

-- ----------------------------------------------------------------------------
-- Seed: the three real apiaries, carried over from js/data.js's
-- apiarySeeds exactly (see header for why hives/inspections don't).
-- ----------------------------------------------------------------------------

insert into public.apiaries (id, code, name, region, address, stage, date_established, flora, brief) values
  ('ap-tambo', 'TMB', 'Tambo Crossing', 'East Gippsland, VIC', '37.4382° S, 147.7461° E', 'maintenance', '2019-01-01',
   'Yellow box, red stringybark, silver wattle',
   'The program''s reference site. Nine generations of closed-population selection with no miticide input since the 2021/22 season.'),
  ('ap-barrow', 'BRW', 'Barrowfield', 'Central Tablelands, NSW', '33.6712° S, 149.5803° E', 'assessment', '2021-01-01',
   'Ironbark, grey box, canola (seasonal)',
   'Mid-cycle assessment of four lines against the Tambo benchmark. Freeze-killed brood assays run fortnightly through the build-up.'),
  ('ap-oradale', 'ORA', 'Oradale', 'Darling Downs, QLD', '27.9012° S, 151.6144° E', 'establishing', '2026-01-01',
   'Spotted gum, brigalow, cultivated sunflower',
   'Site commissioned March 2026. Nucs drawn from Tambo and Kellyanne stock; baseline mite counts still in progress.');
