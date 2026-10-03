# Match artwork test pinned to a clock before round 1

## Request
CI failed on PR #98 (Superbru picks skill). Fix it.

## Cause
The web job failed on `match-artwork.spec.ts` > "loads the venue for the kickoff weather and follows a forecast that arrives later" with a 5 s timeout. The PR changes no web code; the test depends on the real clock. `StadiumSceneService` injects `LiveScoresService`, which requests `/scores` once the selected round is within the pre-kickoff window. The selected round defaults to the current round, and round 2 started on 2 Oct 2026, so from then on the test bed issues a `/scores` request that is never answered and `ApplicationRef.whenStable()` never resolves. Master's last green run (2 Oct 08:17 UTC) was before round 2 started.

## Changes
- `apps/web/src/app/core/competition/match-artwork.spec.ts`: the test fakes only `Date` and sets it to 2026-09-25T10:00:00Z (the forecast's `generatedAt`, before round 1 kicks off), so the selected round is round 1 and no live scores are requested. Real `setTimeout` waits in the test still run. `afterEach` already restores real timers.

## Files
- Changed: `apps/web/src/app/core/competition/match-artwork.spec.ts`
- New: this handoff

## Checks
- The failing spec alone, before the change: 1 failed (timeout), reproduced locally.
- After: the spec 6/6 passed; `npm test -- --watch=false`: 127 files, 641 tests, all passed.
- Not run: build, e2e (no app code changed).

## Next steps
- Other specs that read the current round without pinning the clock may break as the season moves on; none failed today.
