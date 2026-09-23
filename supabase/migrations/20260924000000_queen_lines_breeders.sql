-- ============================================================================
-- Phase 4 of the backend migration: queen lines and breeders — the last
-- entity still on mock data. Requested alongside real hive management
-- (Phase 5) so hives can reference real queen lines instead of the seven
-- fabricated demo lines in js/data.js.
--
-- A queen line's breeder has always been one of two things in this app: a
-- real member, or a standalone lightweight record for someone who
-- contributes a line but isn't a registered platform member
-- (js/store.js's breederById used to resolve either uniformly via
-- `/^m\d+$/.test(id)` — a trick that only worked because mock member ids
-- look like 'm7'; real member ids are uuids, so that heuristic doesn't
-- carry over and needed a real design). No existing table in this schema
-- resolves "either a real member or a different kind of record" —
-- apiary_managers/project_team/repository_team all point at a single
-- members(id) FK. breeder_member_id/breeder_id below, mutually exclusive
-- via an XOR check, is the first time this pattern is needed — same shape
-- repository_documents already uses for storage_path/external_url
-- (20260915000000_repository_link_attachments.sql), just choosing between
-- two tables instead of two values.
--
-- Purge decision, same reasoning as every fake-content phase (2/3/6): none
-- of the 7 mock queen lines carry over. Their names are illustrative
-- ("Barrowfield 14", "Kellyanne 3") and their breeder fields point at mock
-- seed member ids ('m2', 'm7', ...) that don't exist as real members
-- rows — carrying them over would mean fabricating a placeholder breeder
-- or misattributing a real member. Production starts with zero queen
-- lines and zero breeders, same as hives/inspections started empty in
-- Phase 5.
--
-- Between Phase 5 shipping and this migration, a real hive got created
-- through the still-mock queen-line dropdown and picked up 'BRW-14' — one
-- of the purged mock codes — as plain text (hives.queen_line had no FK
-- yet). The hive itself is real and stays; the dangling reference to a
-- line that was never real is cleared below so the new FK can be added.
-- The owning apiary manager can reassign a real queen line afterward.
--
-- RLS stays flat Web-Admin-only for writes on both tables — matching
-- exactly what the mock UI already gated (isWebAdmin() around "Add
-- breeder"/"Add queen line"), not inventing a new tiered manage/operate
-- model nothing asked for. The "Breeder" member_roles role (role_options)
-- is a general permission tier, unrelated to this — it doesn't gate who
-- can be credited as a line's breeder, then or now.
-- ============================================================================

create table public.breeders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  state      text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.queen_lines (
  code              text primary key,   -- e.g. 'BRW-14' — internal key, generated server-side, never entered directly
  name              text not null,
  breeder_member_id uuid references public.members(id),
  breeder_id        uuid references public.breeders(id),
  generation        int not null default 1,
  vsh_mean          int check (vsh_mean between 0 and 100),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint queen_lines_breeder_xor check ((breeder_member_id is not null) <> (breeder_id is not null))
);

update public.hives set queen_line = null
  where queen_line is not null and queen_line not in (select code from public.queen_lines);

-- Finishes the precedent Phase 5 set for itself: hives.queen_line was left
-- unconstrained specifically because this table didn't exist yet.
alter table public.hives add constraint hives_queen_line_fkey
  foreign key (queen_line) references public.queen_lines(code) on delete set null;

-- touch_updated_at() already exists (Phase 1) — reuse it.
create trigger breeders_touch_updated_at before update on public.breeders
  for each row execute function public.touch_updated_at();
create trigger queen_lines_touch_updated_at before update on public.queen_lines
  for each row execute function public.touch_updated_at();

alter table public.breeders    enable row level security;
alter table public.queen_lines enable row level security;

-- breeders: broadly readable; only Web Admin creates/edits one. No delete
-- policy — there's never been a delete UI for a breeder.
create policy breeders_select on public.breeders
  for select to authenticated using (true);
create policy breeders_insert on public.breeders
  for insert to authenticated with check (public.is_web_admin());
create policy breeders_update on public.breeders
  for update to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

-- queen_lines: same shape. No delete policy, same reasoning.
create policy queen_lines_select on public.queen_lines
  for select to authenticated using (true);
create policy queen_lines_insert on public.queen_lines
  for insert to authenticated with check (public.is_web_admin());
create policy queen_lines_update on public.queen_lines
  for update to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

grant select, insert, update on public.breeders    to authenticated;
grant select, insert, update on public.queen_lines to authenticated;
