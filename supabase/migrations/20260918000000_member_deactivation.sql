-- ============================================================================
-- Adds member deactivation — the "delete a member" action on the Members
-- directory (js/views/managers.js).
--
-- A true hard delete of a `members` row isn't viable: forum_threads.
-- author_id, forum_posts.author_id, forum_attachments.author_id,
-- repository_articles.author_id, repository_documents.author_id, and
-- repository_sub_topics.curator_id all reference members(id) with no ON
-- DELETE clause, so deleting a member who has ever posted or contributed
-- would fail with a raw foreign-key violation — and silently erasing forum/
-- repository content just to remove a member would be worse than keeping
-- their (now-deactivated) row around.
--
-- So "delete" here is a soft delete: revoke every role (member_roles),
-- revoke every apiary access grant (apiary_managers), erase their PII
-- (member_contact_details), and stamp deactivated_at. Their name stays, so
-- anything they've already posted or written still shows who wrote it; they
-- just drop out of every "assignable member" picker (loadRealMembers) and
-- lose every role-gated permission everywhere else in the app, since
-- permission checks here are all role-based and they now hold none. The
-- existing member_roles_protect_last_admin trigger (see
-- identity_and_auth_bridge.sql) already stops a Web Admin from deactivating
-- the last remaining Web Admin, since that trigger fires on any delete from
-- member_roles regardless of why the row is being removed.
--
-- Deliberately out of scope for this pass: this doesn't touch auth.users,
-- auth_user_id, or wa_contact_id, so a deactivated member who signs in again
-- via Wild Apricot still completes sign-in (wildapricot-auth's lookup finds
-- their existing row by wa_contact_id) — they just land back on a role-less,
-- contact-detail-less record until a Web Admin reactivates and re-grants.
-- Fully blocking sign-in would need the Edge Function itself to check
-- deactivated_at, a separate change if it's ever needed.
-- ============================================================================

alter table public.members add column deactivated_at timestamptz;

comment on column public.members.deactivated_at is
  'Set when a Web Admin "deletes" this member from the directory. Null = active. See this migration''s header comment for why this is a soft delete, not a row removal.';
