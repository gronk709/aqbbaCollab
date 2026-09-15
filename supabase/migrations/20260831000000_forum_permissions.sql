-- ============================================================================
-- Tightens forum_threads permissions and adds the missing update policy on
-- forum_attachments, per a deliberate product decision: once a topic is
-- published, its own title/body is frozen for its author (a topic is a
-- shared, citable thing other members may already be replying to or
-- subscribed to — quietly editing it out from under them is the problem
-- this closes) — Web Admin can still correct/remove one, same moderation
-- override every other member-authored table in this schema keeps.
--
-- Attachments are deliberately NOT frozen the same way: they're addenda,
-- not the topic's substance, so an author manages their own (add one any
-- time, edit a link's url/label, delete one) regardless of how old the
-- post it's attached to is.
-- ============================================================================

drop policy forum_threads_update on public.forum_threads;
create policy forum_threads_update on public.forum_threads
  for update to authenticated
  using (public.is_web_admin())
  with check (public.is_web_admin());

drop policy forum_threads_delete on public.forum_threads;
create policy forum_threads_delete on public.forum_threads
  for delete to authenticated
  using (public.is_web_admin());

-- forum_attachments had insert/select/delete but no update — needed now so
-- an author can edit a link attachment's url/filename after adding it.
-- (Editing a file attachment in place isn't meaningful — re-upload as a new
-- one instead — but that's a UI choice, not an RLS one: ownership is all
-- this checks.)
create policy forum_attachments_update on public.forum_attachments
  for update to authenticated
  using (author_id = public.current_member_id())
  with check (author_id = public.current_member_id());

grant update on public.forum_attachments to authenticated;
