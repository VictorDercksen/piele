# Home feed: fixed height, scrollable

## Request

Give the Home "From this round." section a set size that scrolls, so it does not resize when switching between the round and the season.

## Changes

- `features/home/feed/feed.html`: the poll and feed items sit in a `.feed-list` region (`role="region"`, `tabindex="0"`, labelled "Round NN feed" / "Season feed") under the heading and scope toggle.
- `feed.scss`: `.feed-list` is 400 px tall (360 px under a 600 px container), scrolls vertically with a thin scrollbar and stable gutter, contains overscroll, and fades its bottom 28 px (24 px bottom padding so the last item scrolls clear). Inset focus outline.
- `feed.ts`: switching scope scrolls the list back to the top; selecting the current scope does nothing.
- `e2e/season-timeline.spec.ts`: the feed journey checks the list scrolls, the section height is unchanged after switching to Season, and the season list starts at the top.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 114 files, 565 passed.
- Playwright `season-timeline`, `stadium-backgrounds`, `leagues`, `manage`, `profile-and-layout` (preinstalled Chromium, temporary config): 40 passed; the feed journey re-run after the fade was added: passed.
- Screenshots of the feed at 390 and 1440 px.

## Unresolved / next steps

- None.
