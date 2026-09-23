-- ============================================================================
-- Adds a subscription channel for new research apiaries. Prior to this,
-- addApiary() (Phase 5) never notified anyone -- subscriptions only covered
-- 'thread'/'cat'/'repo' (20260829000000_forum_repository_subscriptions.sql),
-- all of which watch an *existing* row for new activity under it. There's
-- no equivalent existing row to watch for "a new apiary opened" -- the
-- apiary doesn't exist yet when someone wants to hear about it -- so this
-- is a single fixed channel (subscribable_type = 'apiary',
-- subscribable_id = 'new'), the same shape a forum category subscription
-- already has (a fixed id you subscribe to ahead of the content that will
-- land under it), just with exactly one row instead of one per category.
--
-- No new table, no RLS change: subscriptions' self-only policies and the
-- subscriber_count()/subscriber_counts() RPCs are already generic across
-- subscribable_type. Only the check constraint needs to learn the new type.
-- ============================================================================

alter table public.subscriptions drop constraint subscriptions_subscribable_type_check;
alter table public.subscriptions add constraint subscriptions_subscribable_type_check
  check (subscribable_type in ('thread', 'cat', 'repo', 'apiary'));
