-- ============================================================================
-- "Edited" marker for forum topics and replies. Set by the app whenever an
-- author (or a Web Admin) saves a change to a post's text; null means the
-- post has never been edited. Repository articles already carry updated_at.
-- ============================================================================

alter table public.forum_threads add column if not exists edited_at timestamptz;
alter table public.forum_posts   add column if not exists edited_at timestamptz;
