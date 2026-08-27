-- ============================================================================
-- Phase 2 of the mock-data → Supabase migration: marketplace listings.
-- Deliberately the simplest entity (flat, single owner field, no cascades)
-- — this phase exists to prove the full read/write/RLS pattern cheaply
-- before the bigger, more consequential entities (apiaries/hives/
-- inspections). See /root/.claude/plans/zazzy-swinging-scone.md (or the
-- README's backend-migration section) for the full phased plan.
--
-- Old mock listings (js/data.js) are not carried over — their `seller`
-- fields point at seed member ids ('m1'..'m10') that don't exist as real
-- rows in `members` (only the Phase-1-seeded Web Admin does), and this
-- migration's purge-everything mandate doesn't call for fabricating
-- member rows just to keep demo listings around. The marketplace starts
-- empty; real listings accumulate from here on, authored by real
-- Wild-Apricot-signed-in members only.
-- ============================================================================

create table public.marketplace_listings (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references public.members(id) on delete cascade,
  kind       text not null check (kind in ('Queens', 'Nucs', 'Semen', 'Equipment')),
  title      text not null,
  price      numeric not null check (price >= 0),
  unit       text not null default 'each',
  qty        text not null default 'Enquire for availability',
  detail     text not null default 'Contact the seller for detail.',
  state      text,
  created_at timestamptz not null default now()
);

alter table public.marketplace_listings enable row level security;

-- Broadly readable (a small trusted association's internal marketplace,
-- same reasoning as members/member_roles); self-service to create; edit
-- and delete restricted to the author or Web Admin — matches the plan's
-- general policy shape for member-authored content (forum posts follow
-- the same pattern when that phase lands).
create policy marketplace_listings_select on public.marketplace_listings
  for select to authenticated using (true);

create policy marketplace_listings_insert on public.marketplace_listings
  for insert to authenticated
  with check (seller_id = public.current_member_id());

create policy marketplace_listings_update on public.marketplace_listings
  for update to authenticated
  using (seller_id = public.current_member_id() or public.is_web_admin())
  with check (seller_id = public.current_member_id() or public.is_web_admin());

create policy marketplace_listings_delete on public.marketplace_listings
  for delete to authenticated
  using (seller_id = public.current_member_id() or public.is_web_admin());

grant select, insert, update, delete on public.marketplace_listings to authenticated;
