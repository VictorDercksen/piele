# Kickoff forecast strip layout

Recorded on 25 September 2026 in Africa/Johannesburg time.

## Request

The previous layout put the kickoff forecast beside the Piele preview. On wide desktops it stretched to the preview's height, leaving one row of forecast figures above a large empty sky. The user asked for a better layout, approved the proposed forecast strip and asked for a PR.

## Completed

- `features/match/match.page.html`: the match grid is one column, in this order: kickoff forecast, then the Piele preview, then teamsheets. The DOM order now matches the visual order. The `has-preview` class is removed.
- `features/match/match.page.scss`: removed the grid areas, the preview/forecast top row, the 900 px stacking rule and the rules that stretched and centred the forecast. At 640 px wide and above, the forecast is a strip (reading, then four figures capped at 190 px each). Below that it keeps the stacked phone layout.
- The branch was fast-forwarded to `master` after #23 merged, so this is a fresh PR.

## Checks run

- Prettier check on the changed files: clean.
- `npm run build`: passed without warnings.
- `npm test -- --watch=false`: 70 tests passed across 20 files.
- Playwright development suite: 19 passed. Production suite: 3 passed. Both ran against the installed Chromium through temporary configs, because the pinned headless shell is not in this container.
- Screenshots with mocked preview data at 2000, 1440, 390 and 320 px: no horizontal overflow, and the strip has no empty sky.

## Open items

None.
