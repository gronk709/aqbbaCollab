-- ============================================================================
-- Phase 1 of the mock-data → Supabase migration: identity & the Wild
-- Apricot auth bridge. See /root/.claude/plans/zazzy-swinging-scone.md (or
-- the README's backend-migration section) for the full multi-phase plan.
--
-- This migration creates the tables that make membership, roles, and
-- per-site access grants real (shared, durable, RLS-enforced) instead of a
-- per-browser localStorage patch on top of js/data.js mock arrays. It does
-- NOT touch apiaries/hives/inspections/forum/etc. — those come in later
-- phases, once this identity layer is proven with a real Wild Apricot
-- sign-in.
--
-- Run this against the project via `supabase db push` or the Supabase SQL
-- editor — this sandbox can't reach Supabase's live infrastructure, so it
-- can't be applied or verified from here (same division of labor as the
-- Edge Function deploy earlier in this project).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- The canonical role vocabulary — mirrors js/data.js's roleOptions, which
-- becomes this table's seed data below rather than being replaced by it;
-- js/data.js keeps exporting roleOptions for now (see its [PERMANENT] tag).
create table public.role_options (
  name        text primary key,
  description text not null,
  sort_order  int  not null default 0
);

-- id is members' own identity, deliberately decoupled from auth_user_id:
-- a Web Admin can pre-provision a member row (e.g. importing the WA
-- roster, assigning roles) before that person has ever signed in, and
-- auth_user_id gets filled in the first time they actually do. wa_contact_id
-- is the stable match key the Edge Function looks up by; email is a
-- fallback match for a first-time sign-in, kept in member_contact_details
-- below rather than here (see that table's comment for why).
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  wa_contact_id text unique,
  name          text not null,
  initials      text not null,
  state         text,
  member_since  int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Phone/email/address live in their own table, deliberately split out of
-- members, so the two can carry different RLS: members' name/state/roles
-- are broadly readable (this is a small trusted association's internal
-- tool), but real PII is restricted to the member themselves, Web Admin,
-- and anyone who co-manages an apiary with them — seep_options below. This
-- closes a real gap: today's individual member page (js/views/managers.js
-- renderManager) shows phone/email/address to anyone signed in, with no
-- gate at all.
create table public.member_contact_details (
  member_id  uuid primary key references public.members(id) on delete cascade,
  phone      text,
  email      text,
  address    text,
  updated_at timestamptz not null default now()
);

-- Unique (case-insensitive, nulls excluded): email is the fallback match
-- key the wildapricot-auth Edge Function uses to resolve a first-time sign-
-- in to an existing pre-provisioned member, so two members sharing one
-- email would make that lookup ambiguous — worth a hard constraint rather
-- than trusting every future writer to check first.
create unique index member_contact_details_email_key on public.member_contact_details (lower(email)) where email is not null;

-- A member can hold any number of roles at once (e.g. a Breeder who is
-- also the Apiary Manager for a site) — a join table, not an array column,
-- so RLS policies elsewhere can do simple EXISTS checks and so who-granted-
-- what stays auditable.
create table public.member_roles (
  member_id  uuid not null references public.members(id) on delete cascade,
  role_name  text not null references public.role_options(name) on delete restrict,
  granted_by uuid references public.members(id),
  granted_at timestamptz not null default now(),
  primary key (member_id, role_name)
);

-- The real per-site access grant (today's client-only managersFor/
-- setManagedApiaries in js/store.js). Created now, in the identity phase,
-- rather than waiting for the apiaries table in Phase 5, because the
-- contact-detail visibility policy below needs it to correctly implement
-- "restricted to ... anyone who co-manages an apiary with them" from day
-- one. apiary_id has no foreign key yet — apiaries doesn't exist until
-- Phase 5, which adds `alter table apiary_managers add constraint ...
-- references apiaries(id)` once it does. access_level splits the flat
-- boolean canEditApiary has today into 'manage' (today's full
-- canEditApiary: create/edit/delete hives, edit the apiary) and 'operate'
-- (update-only on hives, but can log inspections) — matching what the
-- Operator/Breeder role descriptions already promise but the current code
-- doesn't actually enforce.
create table public.apiary_managers (
  apiary_id    uuid not null,
  member_id    uuid not null references public.members(id) on delete cascade,
  access_level text not null check (access_level in ('manage', 'operate')),
  granted_by   uuid references public.members(id),
  granted_at   timestamptz not null default now(),
  primary key (apiary_id, member_id)
);

-- ----------------------------------------------------------------------------
-- Helper functions — SECURITY DEFINER with a fixed search_path so RLS
-- policies stay short and can't be tricked by a session-local search_path,
-- and so they don't recurse into the RLS of the tables they query.
-- ----------------------------------------------------------------------------

create function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where auth_user_id = auth.uid();
$$;

create function public.is_web_admin(p_member_id uuid default public.current_member_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_roles
    where member_id = p_member_id and role_name = 'Web Admin'
  );
$$;

-- Mirrors REPOSITORY_CONTRIBUTOR_ROLES in js/store.js. Not wired to any RLS
-- policy yet — the repository tables themselves don't exist until Phase 3
-- — but defined alongside the other permission helpers now so that phase
-- can just reference it.
create function public.can_contribute_repository(p_member_id uuid default public.current_member_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_roles
    where member_id = p_member_id
      and role_name in ('Web Admin', 'Apiary Manager', 'Operator', 'Breeder', 'Creator')
  );
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Stops a member (non-Web-Admin) from reassigning their own identity
-- columns via the self-update policy below — e.g. pointing auth_user_id or
-- wa_contact_id at a different value to confuse the auth bridge or another
-- member's record. A Web Admin editing someone else's row is unaffected,
-- and so is the wildapricot-auth Edge Function itself: it connects as
-- Postgres role `service_role`, which BYPASSRLS but is NOT exempt from
-- triggers — this trigger fires for it too — and it's exactly the thing
-- that needs to set auth_user_id (after admin.createUser()) and backfill
-- wa_contact_id on a first real sign-in. Confirmed by testing this
-- migration locally: without the auth.role() clause below, the Edge
-- Function's own writes to these columns were silently reverted.
create function public.protect_member_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_web_admin() or auth.role() = 'service_role') then
    new.auth_user_id  := old.auth_user_id;
    new.wa_contact_id := old.wa_contact_id;
    new.id            := old.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Lockout prevention: there must always be at least one Web Admin, since
-- that's the only role that can grant roles at all. Deferred to the end of
-- the transaction (not a plain BEFORE trigger) so that reassigning the
-- role in one transaction — delete the old admin's row, insert the new
-- one — is allowed; only a transaction that leaves zero Web Admins at
-- commit time is blocked.
create function public.prevent_zero_web_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.member_roles where role_name = 'Web Admin') then
    raise exception 'Cannot remove the last remaining Web Admin.';
  end if;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

create trigger members_protect_identity
  before update on public.members
  for each row execute function public.protect_member_identity_columns();

create trigger member_contact_details_touch
  before update on public.member_contact_details
  for each row execute function public.touch_updated_at();

create constraint trigger member_roles_protect_last_admin
  after delete on public.member_roles
  deferrable initially deferred
  for each row
  when (old.role_name = 'Web Admin')
  execute function public.prevent_zero_web_admins();

-- ----------------------------------------------------------------------------
-- Row Level Security. Default-deny for everyone signed out: no policy below
-- grants anything to the `anon` role, so it gets nothing regardless.
-- ----------------------------------------------------------------------------

alter table public.role_options            enable row level security;
alter table public.members                 enable row level security;
alter table public.member_contact_details  enable row level security;
alter table public.member_roles            enable row level security;
alter table public.apiary_managers         enable row level security;

-- role_options: broadly readable (it's just the vocabulary), Web-Admin-only
-- to change (adding/renaming a role is a rare, deliberate admin action).
create policy role_options_select on public.role_options
  for select to authenticated using (true);

create policy role_options_write on public.role_options
  for all to authenticated
  using (public.is_web_admin())
  with check (public.is_web_admin());

-- members: name/state/roles-adjacent fields are broadly readable — this is
-- a small trusted association's internal tool, not a public directory —
-- but only self or Web Admin may create or edit a row. (Auto-provisioning
-- a new member on first Wild Apricot sign-in is done by the Edge Function
-- using the service role key, which bypasses RLS entirely, so it doesn't
-- need its own INSERT policy here.)
create policy members_select on public.members
  for select to authenticated using (true);

create policy members_insert on public.members
  for insert to authenticated
  with check (public.is_web_admin());

create policy members_update on public.members
  for update to authenticated
  using (id = public.current_member_id() or public.is_web_admin())
  with check (id = public.current_member_id() or public.is_web_admin());

-- member_contact_details: restricted, per the decision made on this
-- migration — visible to the member themselves, Web Admin, and anyone who
-- co-manages an apiary with them (join through apiary_managers on shared
-- apiary_id; empty/harmless until Phase 5 populates it with real grants).
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

create policy member_contact_insert on public.member_contact_details
  for insert to authenticated
  with check (member_id = public.current_member_id() or public.is_web_admin());

create policy member_contact_update on public.member_contact_details
  for update to authenticated
  using (member_id = public.current_member_id() or public.is_web_admin())
  with check (member_id = public.current_member_id() or public.is_web_admin());

-- member_roles: broadly readable (every permission check in the app reads
-- roles), only Web Admin may grant/revoke.
create policy member_roles_select on public.member_roles
  for select to authenticated using (true);

create policy member_roles_write on public.member_roles
  for all to authenticated
  using (public.is_web_admin())
  with check (public.is_web_admin());

-- apiary_managers: broadly readable (empty until Phase 5; harmless), only
-- Web Admin may grant/revoke — matches today's roles-editor gating
-- (js/views/managers.js openApiaryAccessForm is Web-Admin-only).
create policy apiary_managers_select on public.apiary_managers
  for select to authenticated using (true);

create policy apiary_managers_write on public.apiary_managers
  for all to authenticated
  using (public.is_web_admin())
  with check (public.is_web_admin());

-- ----------------------------------------------------------------------------
-- Grants. RLS policies above only take effect once the role also has the
-- underlying table privilege — Supabase does not grant this automatically
-- on a newly created table.
-- ----------------------------------------------------------------------------

grant usage on schema public to authenticated;

-- role_options intentionally has no delete grant: role_options_write's
-- policy would allow it, but deleting a role still referenced by
-- member_roles would violate that table's FK, so there's nothing a delete
-- grant would let a Web Admin actually do that renaming/retiring a role
-- via update doesn't already cover.
grant select, insert, update on public.role_options to authenticated;
grant select, insert, update         on public.members                to authenticated;
grant select, insert, update         on public.member_contact_details to authenticated;
grant select, insert, delete         on public.member_roles           to authenticated;
grant select, insert, update, delete on public.apiary_managers        to authenticated;

grant execute on function public.current_member_id()        to authenticated;
grant execute on function public.is_web_admin(uuid)          to authenticated;
grant execute on function public.can_contribute_repository(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Seed data: the role vocabulary, and the one permanent fallback identity —
-- Pete Czeti as Web Admin — so there's always someone who can grant roles
-- to real Wild Apricot sign-ins as they arrive. email below is what the
-- wildapricot-auth Edge Function's case-insensitive email fallback match
-- uses to resolve his real Wild Apricot sign-in to THIS row (backfilling
-- wa_contact_id at that point) instead of provisioning a second, duplicate
-- "Pete Czeti" member — double-check this is his real Wild Apricot login
-- email before running this migration.
-- ----------------------------------------------------------------------------

insert into public.role_options (name, description, sort_order) values
  ('Web Admin',      'Superuser. Full access to every apiary, member record, and role/access grant.', 1),
  ('Apiary Manager', 'Complete CRUD privileges for the apiary they manage.', 2),
  ('Operator',       'Assists the Apiary Manager in the conduct of inspections and data updates. Has change and update privileges but cannot create or delete.', 3),
  ('Breeder',        'Has change and update privileges only.', 4),
  ('Member',         'Read-only access to apiary data and the information repository. Full forum access — publish, subscribe, and notifications — and can add Marketplace listings.', 5),
  ('Creator',        'Everything a Member has, plus the ability to add content to the information repository.', 6)
on conflict (name) do nothing;

do $$
declare
  pete_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.members (id, name, initials, state, member_since)
  values (pete_id, 'Pete Czeti', 'PC', 'NSW', 2019)
  on conflict (id) do nothing;

  insert into public.member_contact_details (member_id, email)
  values (pete_id, 'contact@oddacres.io')
  on conflict (member_id) do nothing;

  insert into public.member_roles (member_id, role_name)
  values (pete_id, 'Web Admin')
  on conflict do nothing;
end $$;
