-- ============================================================================
-- Committee Forum — a compartmented discussion space, same shape as the
-- public Forum (20260829000000_forum_repository_subscriptions.sql /
-- 20260830000000_forum_attachments.sql) but visible only to members
-- holding the new "Committee" role (plus Web Admin, who already bypasses
-- most other access gates in this app).
--
-- Deliberately separate tables rather than a `is_committee` flag bolted
-- onto forum_threads/forum_posts/forum_attachments: the whole point of
-- this feature is confidentiality from everyone outside the committee, and
-- a flag shared with the all-members-readable public forum means every
-- future change to that forum's RLS (or a view/query that forgets the
-- filter) is a potential leak of confidential content. Separate tables
-- with their own "is_committee_member() or is_web_admin()" policies are
-- easy to audit in isolation — there is no code path through them that
-- doesn't check committee membership. No categories: the public forum's
-- categories exist to organise volume across a large membership; the
-- committee is small enough that a single flat list of topics is enough,
-- and skipping that structure keeps this migration and its RLS smaller.
--
-- Subscriptions/notifications are NOT duplicated — `subscriptions` and
-- `notifications` are already generic across subscribable_type, so this
-- just teaches them two new types: 'cforum' (a single fixed channel,
-- subscribable_id = 'new', for "notify me of any new committee topic" —
-- same shape 20260923214911_apiary_subscriptions.sql already established
-- for "a new apiary opened", since there's no existing row to watch for
-- content that doesn't exist yet) and 'cthread' (per-topic reply
-- notifications, the same shape as the public forum's own 'thread' type).
-- The notify-subscribers Edge Function needs a matching update (see its
-- own file) to recognise these two new subscribable types.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Role
-- ----------------------------------------------------------------------------

insert into public.role_options (name, description, sort_order) values
  ('Committee', 'Full access to the confidential Committee Forum — publish, subscribe, and notifications. Can only be granted to a member who also holds the Member role (a real Wild Apricot sign-in); granting it to anyone else is rejected.', 11);

create function public.is_committee_member(p_member_id uuid default public.current_member_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_roles
    where member_id = p_member_id and role_name = 'Committee'
  );
$$;

grant execute on function public.is_committee_member(uuid) to authenticated;

-- "Committee cannot be assigned to a non-Member" (the Web Admin UI never
-- offers the checkbox for one, but this is the real boundary — it holds
-- even against a direct API/SQL call). A deferred constraint trigger,
-- same shape as member_roles_protect_last_admin below it: checked once at
-- the end of the statement/transaction, not row-by-row, so a Web Admin
-- granting Member and Committee together in one multi-row insert (or
-- revoking both together in one multi-row delete) is judged by the final
-- state, not by which row happened to be processed first.
create function public.committee_requires_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := coalesce(new.member_id, old.member_id);
begin
  if exists (select 1 from public.member_roles where member_id = v_member_id and role_name = 'Committee')
     and not exists (select 1 from public.member_roles where member_id = v_member_id and role_name = 'Member') then
    raise exception 'Committee requires the Member role — grant Member at the same time (or first), or revoke Committee before removing Member.';
  end if;
  return null;
end;
$$;

create constraint trigger member_roles_committee_requires_member_ins
  after insert on public.member_roles
  deferrable initially deferred
  for each row
  when (new.role_name = 'Committee')
  execute function public.committee_requires_member();

create constraint trigger member_roles_committee_requires_member_del
  after delete on public.member_roles
  deferrable initially deferred
  for each row
  when (old.role_name = 'Member')
  execute function public.committee_requires_member();

-- ----------------------------------------------------------------------------
-- Tables — same column shapes as forum_threads/forum_posts/forum_attachments,
-- minus category_id (no categories here).
-- ----------------------------------------------------------------------------

create table public.committee_threads (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.members(id),
  title      text not null,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create table public.committee_posts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.committee_threads(id) on delete cascade,
  author_id  uuid not null references public.members(id),
  body       text not null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create table public.committee_attachments (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.committee_threads(id) on delete cascade,
  post_id      uuid references public.committee_posts(id) on delete cascade,
  author_id    uuid not null references public.members(id),
  kind         text not null check (kind in ('url', 'file')),
  url          text,
  storage_path text,
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now(),
  check (
    (kind = 'url'  and url is not null and storage_path is null) or
    (kind = 'file' and storage_path is not null and url is null)
  )
);

create index committee_attachments_thread_idx on public.committee_attachments (thread_id, created_at);

-- ----------------------------------------------------------------------------
-- Storage — a separate private bucket, not a path within forum-attachments:
-- storage.objects RLS is bucket-wide, so reusing that bucket would mean a
-- single "any authenticated member" read policy covering confidential
-- committee files too, however tightly committee_attachments itself (the
-- metadata table) is scoped.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'committee-attachments', 'committee-attachments', false, 20971520, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf', 'text/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv', 'image/jpeg', 'image/png'
  ]
);

create policy committee_attachments_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'committee-attachments' and (public.is_committee_member() or public.is_web_admin()));

create policy committee_attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'committee-attachments' and (public.is_committee_member() or public.is_web_admin()));

create policy committee_attachments_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'committee-attachments' and owner = auth.uid());

-- ----------------------------------------------------------------------------
-- Row Level Security. Same author/admin write shape the public forum
-- settled on (20260829000000 + 20260831000000's tightening + 20261021220000's
-- revert — see those migrations), just with select/insert also gated on
-- committee membership instead of being open to every authenticated member.
-- ----------------------------------------------------------------------------

alter table public.committee_threads     enable row level security;
alter table public.committee_posts       enable row level security;
alter table public.committee_attachments enable row level security;

create policy committee_threads_select on public.committee_threads
  for select to authenticated using (public.is_committee_member() or public.is_web_admin());
create policy committee_threads_insert on public.committee_threads
  for insert to authenticated
  with check (author_id = public.current_member_id() and (public.is_committee_member() or public.is_web_admin()));
create policy committee_threads_update on public.committee_threads
  for update to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin())
  with check (author_id = public.current_member_id() or public.is_web_admin());
create policy committee_threads_delete on public.committee_threads
  for delete to authenticated using (public.is_web_admin());

create policy committee_posts_select on public.committee_posts
  for select to authenticated using (public.is_committee_member() or public.is_web_admin());
create policy committee_posts_insert on public.committee_posts
  for insert to authenticated
  with check (author_id = public.current_member_id() and (public.is_committee_member() or public.is_web_admin()));
create policy committee_posts_update on public.committee_posts
  for update to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin())
  with check (author_id = public.current_member_id() or public.is_web_admin());
create policy committee_posts_delete on public.committee_posts
  for delete to authenticated using (author_id = public.current_member_id() or public.is_web_admin());

create policy committee_attachments_select on public.committee_attachments
  for select to authenticated using (public.is_committee_member() or public.is_web_admin());
create policy committee_attachments_insert on public.committee_attachments
  for insert to authenticated
  with check (author_id = public.current_member_id() and (public.is_committee_member() or public.is_web_admin()));
create policy committee_attachments_update on public.committee_attachments
  for update to authenticated
  using (author_id = public.current_member_id())
  with check (author_id = public.current_member_id());
create policy committee_attachments_delete on public.committee_attachments
  for delete to authenticated using (author_id = public.current_member_id() or public.is_web_admin());

grant select, insert, update, delete on public.committee_threads     to authenticated;
grant select, insert, update, delete on public.committee_posts       to authenticated;
grant select, insert, update, delete on public.committee_attachments to authenticated;

-- ----------------------------------------------------------------------------
-- Subscriptions / notifications — widen the existing generic channels
-- rather than duplicate them.
-- ----------------------------------------------------------------------------

alter table public.subscriptions drop constraint subscriptions_subscribable_type_check;
alter table public.subscriptions add constraint subscriptions_subscribable_type_check
  check (subscribable_type in ('thread', 'cat', 'repo', 'apiary', 'cforum', 'cthread'));

-- A non-committee member could otherwise insert their own 'cforum'/'cthread'
-- subscription row (the table has no way to know what it's a subscription
-- *to*) and have notify-subscribers — which trusts `subscriptions` rows
-- without re-checking who's allowed to see the content — hand them a
-- notification containing a snippet of confidential committee content.
-- Every other subscribable_type is to content that's already readable by
-- any authenticated member, so this check only needs to apply to these two.
alter policy subscriptions_insert on public.subscriptions
  with check (
    member_id = public.current_member_id()
    and (
      subscribable_type not in ('cforum', 'cthread')
      or public.is_committee_member()
      or public.is_web_admin()
    )
  );

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('reply', 'thread', 'repo', 'cforum', 'creply'));
