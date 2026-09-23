# Layout, profile box, loader and pinned round bar

Recorded on 2026-09-23 in Africa/Johannesburg time. Paths are relative to `apps/web`.

## Requests and completed changes

1. **Full-height season rail.** The round timeline is now a left column spanning the whole screen height on desktop (>1050 px), with the Piele crest and name at the top on the same background as the rail. The rail is sticky, only `.round-track` scrolls, and it fades into a separator above the "18 rounds" footer. The "Jump to round" dropdown was removed at every width. Tablet and phone keep the horizontal timeline. Files: `core/layout/shell/*`, `core/layout/season-timeline/*`.
2. **Single top bar.** The brand bar and utility bar were merged into one sticky `.top-bar` (76 px, 64 px on phones): page links on the left, then "SAMPLE LEAGUE" (sample data only, hidden below 1100 px), notifications, and the profile box at the far right. The round/page breadcrumb and "URC 26/27" were removed, together with the `crumb` route data.
3. **Profile box.** The home "Your seat in the clubhouse" banner was removed. The top-bar profile link is now a box filled with the favourite team's colour (`--member-colour`, accent border) showing avatar, name and "<short team name> supporter" with a small jersey. On phones it shrinks to the avatar in a coloured ring. On tablets the name truncates instead of overflowing.
4. **URC ball loader.** The user's `src/assets/urc-loader` artwork was converted to a centred 256 px WebP (`public/assets/images/urc-ball.webp`, 16 KB). `shared/loader` provides `app-loader` (size, label, optional visible label, `role="status"`). Used in: `index.html` before Angular starts, the root `App` until the first navigation ends, the shell when a page change takes longer than 150 ms (not for round changes), the More page API check, the evidence and vote submit buttons (`aria-busy`), and profile photo processing. The source folder was later emptied by the user and is not committed.
5. **Round header and width.** The large round number and "PIELE URC / 26–27" label were removed. The 1500 px content cap was removed. Fixtures and duty cards use auto-fill grids, and the poll card spans the full width. `--gutter` on `.main-content` drives edge-to-edge dividers.
6. **Pinned round bar.** The round header and the fixture strip form `.round-bar`, sticky under the top bar on every page. The strip moved out of the match hero into `core/layout/fixture-ribbon` without the "ROUND 01 →" label. The featured fixture lives in `RoundViewService.featured()` / `feature(id)`, so the strip and the home match centre share it.
7. **Bug fix.** The Rounds page showed the snapshot date as 22 September because the date pipe formatted a local date in UTC. It now shows 23 September.

## Checks run

- `ng build`: passed, no warnings, initial bundle 372.48 kB.
- `ng test --watch=false`: 10 passed.
- `PIELE_WEB_PORT=4300 npx playwright test`: 10 passed, run twice. New or updated tests cover the rail and top bar staying in place, the round bar at y=76, the fixture strip featuring a match on Home and showing on other pages, the loader at start-up and slow page changes, and the profile box text and jersey.
- Screenshots were reviewed at 1737, 1440, 900 and 390 px. No horizontal overflow from 801 to 1100 px after the tablet top-bar fix.

## Open points

1. On phones the pinned round bar takes about 170 px. The user was offered letting it scroll away on phones only.
2. The profile box uses the short team name ("Stormers"). The user was offered the full name.
3. Clicking a fixture on pages other than Home only highlights it.
4. The inline styles in `index.html` need allowing (or moving) when a Content Security Policy is added.
