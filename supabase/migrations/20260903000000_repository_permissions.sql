-- ============================================================================
-- Rescopes Repository content permissions to match how Apiary Manager and
-- Project Manager already work: the previous migration
-- (20260902000000_repository_content.sql) gated add/edit on a blanket
-- role list (any Web Admin/Apiary Manager/Operator/Breeder/Creator could
-- write to any sub-topic) — on reflection, requested to be scoped instead,
-- the same way apiary edit rights aren't blanket to every Apiary Manager
-- everywhere, and project content rights aren't blanket to every Project
-- Manager on every project.
--
-- New role: Repository Manager (add/edit/delete on assigned sub-topics —
-- the manage tier). The existing Creator role becomes the contribute tier
-- (add/edit, no delete) rather than a blanket repository-wide grant — its
-- js/data.js description is updated to say so. Both are only real once a
-- Web Admin assigns them to a specific sub-topic via repository_team,
-- mirroring apiary_managers/project_team exactly: holding the role tag
-- alone grants nothing.
--
-- Creating a track or sub-topic itself stays Web-Admin-only, unchanged
-- (repository_tracks_write/repository_sub_topics_write from Phase 3
-- already enforce this — nothing to change there).
-- ============================================================================

insert into public.role_options (name, description, sort_order) values
  ('Repository Manager', 'Add, edit and delete content on repository sub-topics they''ve been assigned to manage. Cannot create a new track/sub-topic, or manage one they haven''t been assigned to.', 9);

create table public.repository_team (
  sub_topic_id text not null references public.repository_sub_topics(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  access_level text not null check (access_level in ('manage', 'contribute')),
  granted_by   uuid references public.members(id),
  granted_at   timestamptz not null default now(),
  primary key (sub_topic_id, member_id)
);

alter table public.repository_team enable row level security;

create policy repository_team_select on public.repository_team
  for select to authenticated using (true);
create policy repository_team_write on public.repository_team
  for all to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

grant select, insert, update, delete on public.repository_team to authenticated;

create function public.repository_access_level(p_sub_topic_id text, p_member_id uuid default public.current_member_id())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access_level from public.repository_team
  where sub_topic_id = p_sub_topic_id and member_id = p_member_id;
$$;

create function public.can_contribute_repository_sub(p_sub_topic_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_web_admin() or public.repository_access_level(p_sub_topic_id) in ('manage', 'contribute');
$$;

create function public.can_manage_repository_sub(p_sub_topic_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_web_admin() or public.repository_access_level(p_sub_topic_id) = 'manage';
$$;

grant execute on function public.repository_access_level(text, uuid)   to authenticated;
grant execute on function public.can_contribute_repository_sub(text)  to authenticated;
grant execute on function public.can_manage_repository_sub(text)      to authenticated;

-- Re-point repository_articles/repository_documents at the scoped checks.
-- Update is now open to anyone with contribute-or-above on that sub-topic
-- (not just the original author) — same "any assigned Contributor/Manager
-- can edit any row" shape Projects' project_sections already uses; delete
-- needs manage-or-above.

drop policy repository_articles_insert on public.repository_articles;
create policy repository_articles_insert on public.repository_articles
  for insert to authenticated
  with check (author_id = public.current_member_id() and public.can_contribute_repository_sub(sub_topic_id));

drop policy repository_articles_update on public.repository_articles;
create policy repository_articles_update on public.repository_articles
  for update to authenticated
  using (public.can_contribute_repository_sub(sub_topic_id))
  with check (public.can_contribute_repository_sub(sub_topic_id));

drop policy repository_articles_delete on public.repository_articles;
create policy repository_articles_delete on public.repository_articles
  for delete to authenticated
  using (public.can_manage_repository_sub(sub_topic_id));

drop policy repository_documents_insert on public.repository_documents;
create policy repository_documents_insert on public.repository_documents
  for insert to authenticated
  with check (author_id = public.current_member_id() and public.can_contribute_repository_sub(sub_topic_id));

drop policy repository_documents_delete on public.repository_documents;
create policy repository_documents_delete on public.repository_documents
  for delete to authenticated
  using (public.can_manage_repository_sub(sub_topic_id));

-- Storage objects are uploaded under `${subTopicId}/...` (see
-- addRepositoryDocument in js/store.js) — split_part pulls that first path
-- segment back out to check scoped access, since a storage policy can't
-- join against our own tables' columns directly.

drop policy repository_documents_objects_insert on storage.objects;
create policy repository_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'repository-documents' and public.can_contribute_repository_sub(split_part(name, '/', 1)));

drop policy repository_documents_objects_delete on storage.objects;
create policy repository_documents_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'repository-documents' and (owner = auth.uid() or public.can_manage_repository_sub(split_part(name, '/', 1))));
