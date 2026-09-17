# Known issues

A running list of confirmed bugs not yet fixed — noted here rather than fixed
immediately, usually because a fix is better done alongside related work already
planned (see `/root/.claude/plans/zazzy-swinging-scone.md` for the backend
migration phases) or because it's low-impact enough to batch with something else.

## Open

- **`notify-subscribers` Edge Function trusts the caller's payload completely
  (moderate severity — a real security gap, not just a correctness one).**
  It only checks that the caller has *a* valid Supabase session
  (`supabase/functions/notify-subscribers/index.ts`); it never verifies that
  `actorId`/`actorName`/`itemTitle`/`contextName`/`path` correspond to
  anything real, or that the caller actually authored what they claim to.
  Any real signed-in member — not just Web Admin — can call this endpoint
  directly (bypassing the app's UI) with a hand-crafted payload to: (a)
  insert a `notifications` row into every subscriber's feed falsely
  attributed to any other member (including Web Admin), and (b) email every
  subscriber of a thread/repo/category with attacker-controlled subject,
  body and link, sent from the association's real address. Small trusted
  membership makes this moderate rather than severe, but it's a real
  phishing/impersonation vector open to one compromised or malicious member
  account. Fix: derive the actor from the verified JWT instead of trusting
  the payload, and validate that the referenced content actually exists
  before notifying.

- **`forum_attachments` doesn't cross-validate `storage_path`/`post_id`.**
  (`supabase/migrations/20260830000000_forum_attachments.sql`) No check that
  a claimed `storage_path` actually belongs to an object the inserting
  member uploaded, and no check that `post_id` (when set) actually belongs
  to the same `thread_id` on the row. A member could claim authorship of
  someone else's uploaded file, or attach to a reply that isn't actually in
  the stated thread, producing a data-integrity mismatch (attachment shows
  in, or is orphaned from, the wrong thread context). Low severity —
  attachment content is already broadly readable to every member regardless
  — but worth a follow-up constraint or trigger.

- **`notifications` RLS lets a member rewrite their own notification's
  content, not just mark it read.**
  (`supabase/migrations/20260916000000_notifications.sql`'s
  `notifications_update` policy) Only restricts which *row* a member can
  touch (their own), not which *columns* — a member can
  `update({body: 'anything'})` on their own notification row and it passes
  RLS. No cross-member exposure — cosmetic, self-only impact — but the
  intent (self-service read-state only) isn't actually what's enforced.

## Fixed

- **"Wild Apricot ID" showed "undefined" for a real Wild Apricot sign-in.**
  Fixed by adding `wa_contact_id` to the `members` select in
  `loadSignedInMember()` (`js/store.js`) and mapping it onto `state.remoteMember.wa`
  — shown as-is (the real plain numeric contact id), not reformatted to match the
  seed data's `WA-XXXXX` string. Only closes the gap for a member's *own* record
  (`currentUser()`/`renderManager` on yourself); another real member's detail page
  still reads the un-migrated seed/demo roster (`js/views/managers.js`'s
  `renderMembers`/`renderManager` for someone else) — a separate, broader gap
  tracked in the README's "Members directory" section, not this one.
