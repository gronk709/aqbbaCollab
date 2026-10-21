-- ============================================================================
-- Images in forum posts. They ride the existing forum_attachments pipeline
-- as ordinary file attachments (kind = 'file', mime_type image/jpeg or
-- image/png) — the app resizes and compresses them in the browser before
-- upload, and renders attachments with an image mime type inline in the
-- post instead of as a download chip. The only database change needed is
-- letting the private bucket accept the two image types.
--
-- Repository article images need no change: they use the repository-documents
-- bucket, which already allows image/png and image/jpeg.
-- ============================================================================

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['image/jpeg', 'image/png']) as m
)
where id = 'forum-attachments';
