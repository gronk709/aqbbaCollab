# Known issues

A running list of confirmed bugs not yet fixed — noted here rather than fixed
immediately, usually because a fix is better done alongside related work already
planned (see `/root/.claude/plans/zazzy-swinging-scone.md` for the backend
migration phases) or because it's low-impact enough to batch with something else.

## Open

- **"Wild Apricot ID" shows "undefined" for a real Wild Apricot sign-in.**
  `js/views/managers.js`'s `renderManager()` (the individual member detail page)
  displays `m.wa` under "Wild Apricot ID" — a field that exists on the mock seed
  members in `js/data.js` (e.g. `wa: 'WA-40118'`) but was never added to the
  `state.remoteMember` object `loadSignedInMember()` (`js/store.js`) builds for a
  real signed-in member, so it reads as `undefined`.
  Fix needs: add `wa_contact_id` to the `members` select in `loadSignedInMember()`
  and map it onto the returned object (naming it consistently — real
  `wa_contact_id` is a plain numeric Wild Apricot contact id, not the
  seed data's `WA-XXXXX`-formatted string, so the display format should probably
  change too rather than just filling in the same shape).
