-- ============================================================================
-- Adds website links as a third repository attachment kind, alongside the
-- file uploads repository_documents already held (20260902000000). A link
-- is just a repository_documents row with no uploaded file: storage_path
-- is null and external_url holds the URL instead. Reusing the same table
-- (rather than a new repository_links table) keeps the merge/list/delete
-- code in js/store.js and js/views/repository.js working for both kinds
-- with one small branch, instead of a second parallel path.
-- ============================================================================

alter table public.repository_documents
  alter column storage_path drop not null,
  add column external_url text,
  add constraint repository_documents_file_xor_link
    check ((storage_path is not null) <> (external_url is not null));
