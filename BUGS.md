# Known issues

A running list of confirmed bugs not yet fixed — noted here rather than fixed
immediately, usually because a fix is better done alongside related work already
planned (see `/root/.claude/plans/zazzy-swinging-scone.md` for the backend
migration phases) or because it's low-impact enough to batch with something else.

## Open

(none currently)

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
