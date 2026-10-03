# League switch: header badge and avatar flicker

## Request
A screen recording showed the header flashing while switching leagues: a "12" unread badge on the notifications flag and a "Y" avatar, then "VD" initials, then the photo. Reported as a bug.

## Cause
`HttpLeagueData.load()` clears the previous league's records (as required) before the new league's `me` and photo arrive. In that gap:
- the read state is empty, but the round's competition events (not league-scoped) are still loaded, so every event counted as unread;
- `me` and the photo are null, so `ProfileService.initials` fell back to "You" ("Y"), then to the display name's initials until the photo loaded.

## Changes
- `core/league/notifications/notification.service.ts`: nothing counts as unread while `LeagueData.loading()` is true (the league's read state is not known yet).
- `core/layout/shell/shell.ts`, `shell.html`, new `shell.models.ts`: the header's photo/initials and name come from a `linkedSignal` (`identity`) that keeps the previous value while the league's records load. The photo is account-wide, so it is the same person.
- Specs: `notification.service.spec.ts` (nothing unread while loading) and `shell.spec.ts` (avatar and name held during loading, updated after).

## Checks
- Both new specs fail with the source changes reverted and pass with them.
- `npm test -- --watch=false`: 127 files, 643 tests, all passed (run with Node 24; the container's Node 22.22.0 is below the Angular CLI minimum).
- `npm run build`: completed, no warnings.
- Prettier check on the changed folders: clean.
- Not run: e2e, and no check on a real device.

## Unresolved / next steps
- If the league load fails (`error`, not loading), the read state stays empty and competition events count as unread, as before this change.
- The favourite-team colours and the "supporter" line still reset during the switch; they are per league, so they were left alone.
