-- ============================================================================
-- Edits to existing repository articles and forum topics/posts are limited
-- to their author (a Web Admin keeps the moderation override every other
-- member-authored table here has).
--
-- Before: repository_articles_update allowed ANY member with contribute
-- access to the sub-topic to edit ANY article in it, and
-- forum_threads_update allowed only Web Admins (an author couldn't edit
-- their own topic). forum_posts_update was already author-or-admin.
--
-- Not touched: replying. forum_posts_insert only requires that the new
-- reply's author_id is the signed-in member, so any member can still reply
-- to any topic. Adding an article still needs contribute access to the
-- sub-topic, and deleting one still needs manage access.
-- ============================================================================

alter policy repository_articles_update on public.repository_articles
  using (
    public.is_web_admin()
    or (author_id = public.current_member_id() and public.can_contribute_repository_sub(sub_topic_id))
  )
  with check (
    public.is_web_admin()
    or (author_id = public.current_member_id() and public.can_contribute_repository_sub(sub_topic_id))
  );

alter policy forum_threads_update on public.forum_threads
  using (author_id = public.current_member_id() or public.is_web_admin())
  with check (author_id = public.current_member_id() or public.is_web_admin());
