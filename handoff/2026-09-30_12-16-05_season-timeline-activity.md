# Season timeline: status pills, your duties and open decisions

## Request

Turn the timeline's Current, Completed and Upcoming text into Spartan pills, and show the member's duties (completed, rejected or open) and any decisions not yet accepted or resolved. Four visual options were mocked; the user chose option D, the right gutter.

## Changes

- `core/layout/season-timeline/season-timeline.ts`: the round status is a Helm outline badge (`.round-status`, `data-status`). Rounds with activity get a `.round-marks` gutter at the right edge: a Duties token tinted by the member's duty state and a Decisions token with a count. The component reads `DutyService`, `CaseService` and `PollService`. The stop's accessible name adds the activity, e.g. `Round 02, Current, your duty open, 2 decisions open`. The marks themselves are `aria-hidden`.
- `round-activity.ts` (pure) and `season-timeline.models.ts`: per round, the member's duty state and the number of unresolved decisions.
  - Duty: `done` when completed, `rejected` when the latest evidence was rejected, otherwise `open` (pending deadline, open, overdue, under review). Several duties in one round show the most pressing (rejected, open, done). Voided and season-wide duties are left out.
  - Decisions: live cases (`open`, `in_review`) with a round, plus open polls. Season-wide cases have no round and are not shown.
- `season-timeline.scss`: pill and mark styles. Current is filled coral; Completed green; Upcoming muted outline. In the rail the marks are icon-only tokens stacked in a column; stops with marks trim the right padding and pull the gutter in so "Round 02" stays on one line in the 160 px rail. In the phone sheet the marks sit in a row and the duty token shows its word.
- `e2e/season-timeline.spec.ts`: Round 03's accessible name now includes `1 decision open`.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 115 files, 569 passed (new `round-activity.spec.ts`).
- Playwright `season-timeline`, `mobile-round-picker`, `profile-and-layout`, `evidence-cases` (preinstalled Chromium, temporary config, dev server on 4300): 22 passed, including the 320 px round sheet.
- Screenshots of the rail at 1440 px (175 px rail) and 1100 px (160 px rail), and the 390 px sheet: no clipped pills, titles on one line.

## Unresolved / next steps

- Decision count is every unresolved decision in the round, not only those waiting on the member. Change `roundActivity` if the user wants only their own.
- Season-wide cases (no round) do not appear on the timeline.
