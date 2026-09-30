# More page: grouped list layout

## Request

Improve the look of the More page. Three visual options were mocked on a design canvas; the user chose option A, the grouped list.

## Changes

- `features/more/more.page.html`, `.scss`, `.ts`: the league line is now a club card (the league crest via `app-league-crest`, the name, then Season, Captain and Times in as a three-column `dl`). The links are rounded groups under small uppercase labels: **Round NN** (Standings, and Captain's desk for `administers`), **Season** (Constitution, and the official fixture source with its fixture and playoff counts), then **This device**. Each row has a tinted icon tile, a title, a one-line description and the trailing Lucide icon. The snapshot date note sits under the Season group. The wordmark is centred.
- `features/more/push-card/push-card.html`, `.scss`: the card matches the groups. The heading row has the bell tile, `Notifications` (now `h3`), the summary and an `On` status when push is on. Switches sit on the right of each kind, with rules between rows. "Turn off on this device" is a full-width accent text row (`hlmBtn` without `.text-button`, so it no longer takes the white stitched pill).
- e2e: link names changed from "Round 02 captain's desk" / "Round 02 standings" to "Captain's desk" / "Standings", and `.league-line` became `.club-card`. Updated `leagues`, `match-centre`, `superbru`, `season-timeline` and `evidence-cases` specs accordingly.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 115 files, 569 passed.
- Playwright, full suite (preinstalled Chromium, temporary config, dev server on 4300): 72 passed.
- Screenshots at 390 px, 320 px and 1440 px; no horizontal overflow at 390 or 320 px. The push "on" state was shown by swapping the card's signals in the dev build, since push is unconfigured in the sample build.

## Unresolved / next steps

- The group labels and row descriptions are new copy; adjust wording if needed.
- On desktop the groups run the full content width; a max width could be added if the rows feel too long.
