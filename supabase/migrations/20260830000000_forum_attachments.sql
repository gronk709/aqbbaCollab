-- ============================================================================
-- Forum attachments: URLs and documents (PDF/Word/text/etc.) attached to a
-- topic's opening post or any reply. post_id is null for an attachment on
-- the thread's opening post (which lives on forum_threads, not a
-- forum_posts row — see the Phase 3 migration's header comment for why
-- that's split that way) and set for an attachment on a specific reply.
--
-- Files themselves live in a private Storage bucket ('forum-attachments'),
-- not a public one — same members-only posture as every other table here —
-- so downloads go through a signed URL generated on demand (see
-- js/store.js's openForumAttachment), never a plain public URL.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forum-attachments', 'forum-attachments', false, 20971520, array[
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
    'text/csv'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.forum_attachments (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.forum_threads(id) on delete cascade,
  post_id      uuid references public.forum_posts(id) on delete cascade,
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

create index forum_attachments_thread_idx on public.forum_attachments (thread_id, created_at);

alter table public.forum_attachments enable row level security;

-- Same shape as forum_posts: broadly readable, self-service create,
-- author-or-Web-Admin delete.
create policy forum_attachments_select on public.forum_attachments
  for select to authenticated using (true);
create policy forum_attachments_insert on public.forum_attachments
  for insert to authenticated with check (author_id = public.current_member_id());
create policy forum_attachments_delete on public.forum_attachments
  for delete to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin());

grant select, insert, delete on public.forum_attachments to authenticated;

-- Storage RLS: any signed-in member can read/write objects in this bucket
-- (matches forum_posts' own "broadly readable, self-service create"
-- posture); delete restricted to whoever uploaded it. Storage sets
-- `owner` to auth.uid() automatically on upload.
create policy forum_attachments_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'forum-attachments');
create policy forum_attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'forum-attachments');
create policy forum_attachments_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'forum-attachments' and owner = auth.uid());
