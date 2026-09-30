# Empty states: grouped row

## Request

Improve the app's empty states. Three visual options were mocked on a design canvas; the user chose option B, the grouped row that matches the More page.

## Changes

- `src/styles/ui.scss`: `.round-empty` is a rounded surface card (16 px radius, line border). An `app-icon` child sits in a 40 px tinted tile beside the title and note (grid, via `:has(> app-icon)`); without a note the row centres. Titles are 17 px bold, notes 14 px muted. A `button.text-button` inside becomes a full-width accent row under a rule, without the white stitched pill (`::after` removed). Inside a folding section (`.dropdown-inner`) the card keeps 20 px below it. On honours boards (standings page and home panel) the card stays flat: no background, border or radius. The old 23 px heading and the phone override are gone.
- Icons added where empty states had none: duties (`duties`), captain's evidence review (`check`), captain's Superbru picks (`rounds`), standings page (`standings`, three states). `Icon` imported in `picks-card.ts` and `standings.page.ts`.
- `features/duties/duties.page.html`, `.ts`: an empty personal register shows a "See league duties" row that switches the scope to the league (`selectScope('league')`). Hidden while the register loads and on the league scope. `NgIcon` and `lucideArrowRight` added.
- `e2e/season-timeline.spec.ts`: new test that the action switches to the league scope and disappears there.

## Checks run

- `ng build` (Node 24): success, no warnings.
- `ng test --watch=false`: 115 files, 569 passed.
- Playwright full suite (temporary config, dev server on 4300): 73 passed.
- Screenshots at 390 px of Duties (both scopes), Captain's desk evidence section, Decisions and Standings in Round 05; no horizontal overflow.

## Unresolved / next steps

- `picks-card.html` has a long line prettier would wrap; it predates this change and was left as is.
- Empty-state wording is unchanged.
