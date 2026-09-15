-- ============================================================================
-- Real in-app authoring for Repository content. Phase 3 (see
-- 20260829000000_forum_repository_subscriptions.sql) deliberately left
-- article/document content file-based under content/repository/ — that
-- was, and stays, a permanent design choice, not a gap. This migration
-- doesn't touch that path at all; it adds a second, parallel content
-- source for content actually authored from inside the app, replacing
-- the "Contribute" form's simulated publish (js/views/repository.js's
-- openContribute previously just showed a toast and wrote nothing).
--
-- The two sources are merged client-side per sub-topic (js/store.js's
-- loadSubTopic, js/views/repository.js) rather than one replacing the
-- other — real association material that predates this feature doesn't
-- need to be re-authored through it.
--
-- Permission model reuses the existing repository-contributor role set
-- (js/store.js's REPOSITORY_CONTRIBUTOR_ROLES: Web Admin, Apiary Manager,
-- Operator, Breeder, Creator) rather than inventing a new per-sub-topic
-- grant like Projects' Manager/Contributor split — nothing asked for
-- that scoping here, and this mirrors how canContributeRepository already
-- works today, just now enforced in the database too, not just the UI.
-- Add/edit is any contributor-role member; delete is the item's own
-- author or a Web Admin, same shape as forum posts/marketplace listings.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'repository-documents', 'repository-documents', false, 20971520, array[
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
    'text/csv',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp'
  ]
);

-- can_contribute_repository() already exists (Phase 1's identity
-- migration defined it ahead of time, in anticipation of this — same
-- role list checked here) with its grant already in place; this
-- migration just gives it something real to gate.

create table public.repository_articles (
  id           uuid primary key default gen_random_uuid(),
  sub_topic_id text not null references public.repository_sub_topics(id) on delete cascade,
  author_id    uuid not null references public.members(id),
  title        text not null,
  summary      text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.repository_documents (
  id           uuid primary key default gen_random_uuid(),
  sub_topic_id text not null references public.repository_sub_topics(id) on delete cascade,
  author_id    uuid not null references public.members(id),
  filename     text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index repository_articles_sub_idx on public.repository_articles (sub_topic_id, created_at);
create index repository_documents_sub_idx on public.repository_documents (sub_topic_id, created_at);

alter table public.repository_articles  enable row level security;
alter table public.repository_documents enable row level security;

create policy repository_articles_select on public.repository_articles
  for select to authenticated using (true);
create policy repository_articles_insert on public.repository_articles
  for insert to authenticated
  with check (author_id = public.current_member_id() and public.can_contribute_repository());
create policy repository_articles_update on public.repository_articles
  for update to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin())
  with check (author_id = public.current_member_id() or public.is_web_admin());
create policy repository_articles_delete on public.repository_articles
  for delete to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin());

create policy repository_documents_select on public.repository_documents
  for select to authenticated using (true);
create policy repository_documents_insert on public.repository_documents
  for insert to authenticated
  with check (author_id = public.current_member_id() and public.can_contribute_repository());
create policy repository_documents_delete on public.repository_documents
  for delete to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin());

grant select, insert, update, delete on public.repository_articles   to authenticated;
grant select, insert, delete        on public.repository_documents  to authenticated;

-- Storage RLS: unlike forum-attachments (any signed-in member can upload,
-- since any member can post to the forum), uploading here specifically
-- requires a contributor role, matching the row-level insert check above.
create policy repository_documents_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'repository-documents');
create policy repository_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'repository-documents' and public.can_contribute_repository());
create policy repository_documents_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'repository-documents' and (owner = auth.uid() or public.is_web_admin()));
