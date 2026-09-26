# Member monograms

Request: replace the broken "?" placeholders on the leaderboards with something that fits the app's design.

## Cause

The API sends no favourite team or photo for other members, so the standings rows requested `assets/images/teams/.png` (and the house-marks table `tbc.png`), neither of which exists. iOS showed its broken-image icon.

## Completed

- `shared/member-avatar`: `MemberAvatar` shows the member's photo (round, brass ring), else their team artwork, else a brass monogram (gilt Georgia initials on a dark timber disc, matching the honours board plaque). Sized with `--avatar-size`. `monogram()` takes one initial per word or capitalised part (TheoLotter TL, DanB97 DB, Wolfgodallahmeen W).
- Used on the home leaderboard and on both standings tables (Superbru points and house marks).
- Production round 1 standings were loaded earlier today through the Supabase connector at the user's request: 12 rows, one `standings.recorded` audit event, one feed entry.

## Checks run

- `npm test`: 74 passed (new `member-avatar.spec.ts`). `npm run build`: no warnings. `npm run test:e2e`: 24 passed (temporary config pointing at `/opt/pw-browsers/chromium`).
- Screenshots of the home leaderboard and standings page at 390 px and 1280 px, with the sample members temporarily given no team (reverted).

## Next

- Other members' favourite teams and photos could be returned by `GET /v1/members` so rows show their club artwork; not done.
