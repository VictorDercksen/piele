# Home feed: fills the row on desktop

## Request

On desktop the "From this round." feed should show more: it stopped at 400 px beside a taller standings board, leaving empty space.

## Changes

- `features/home/home.page.scss`: `.club-feed` is a flex column.
- `features/home/feed/feed.scss`: the feed host fills the section; `.feed-list` is `flex: 1 0 0; height: 0; min-height: 400px`, so beside the standings board it grows to the board's height (the zero height keeps its items from stretching the grid row), and on its own full-width row it stays 400 px. Phones (container ≤ 600 px) keep the fixed 360 px. The height still does not change when switching round/season.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 114 files, 565 passed.
- Playwright `season-timeline`, `profile-and-layout`, `stadium-backgrounds` (preinstalled Chromium, temporary config): 20 passed.
- Measured at 1440 px round 2: beside the board (next actions hidden) the feed matches the board's 738 px with a 617 px list, same after switching to Season; full-width row 400 px list; 390 px phone 360 px list.

## Unresolved / next steps

- None.
