-- ============================================================================
-- Makes the Notifications page (js/views/notifications.js) real. It's shown
-- mock seed rows from js/data.js since the very first mock prototype;
-- notify-subscribers (20260915000000... — see its own header comment) sends
-- real subscriber emails now, but never wrote anything a member could see
-- inside the app itself. This adds that: one row per notified subscriber,
-- written by notify-subscribers alongside the email it sends (or instead of
-- one, for a subscriber with no email on file — the in-app notification
-- doesn't depend on email delivery succeeding).
--
-- Only three kinds exist because those are the only three events the app
-- actually generates today (forum reply, forum new topic, repository
-- article/document/link) — 'insp'/'market' stay mock-only kindMeta entries
-- in the view until inspections/marketplace get their own real activity.
-- ============================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  actor_id    uuid references public.members(id) on delete set null,
  kind        text not null check (kind in ('reply', 'thread', 'repo')),
  source_name text not null,
  body        text not null,
  link_path   text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index notifications_member_idx on public.notifications (member_id, created_at desc);

alter table public.notifications enable row level security;

-- Self-only, both ways — same shape as subscriptions. No insert/delete
-- policy for `authenticated` at all: every row is written by
-- notify-subscribers running as the service role (which bypasses RLS),
-- never directly by a client.
create policy notifications_select on public.notifications
  for select to authenticated using (member_id = public.current_member_id());
create policy notifications_update on public.notifications
  for update to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

grant select, update on public.notifications to authenticated;
