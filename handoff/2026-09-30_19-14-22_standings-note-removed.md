# Standings: note above the table removed

## Request

On The Pecking Order page, remove the text above the table.

## Changes

- `features/standings/standings.page.html`: the `.page-description` paragraph under the Round / Season / House marks tabs is gone for all three tabs. The board follows the tabs directly.
- `standings.page.spec.ts`: dropped the assertion on that paragraph's season text.

## Checks run

- `ng build` (Node 24): success, no warnings.
- `ng test --watch=false`: 115 files, 569 passed.
- Playwright `superbru`, `season-timeline`, `leagues`, `stadium-backgrounds`: 36 passed.
- Screenshot at 390 px of Round 02 standings.

## Unresolved / next steps

- The explanations it held (round only; season computed from picks with captain corrections; one house mark per overdue week) are no longer shown on the page.
