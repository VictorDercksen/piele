# Outcome panels: decision pill and date chip

## Request

Duties: keep the Accepted/Rejected pills in the submission line; under "Completed" remove "Accepted" and show the completion date as a chip styled like the Due chip, with a completed icon. Decisions: under "Outcome" show the pill instead of the resolution reason, and the date below it as the same chip. Rejected gets a pill too.

## Changes

- `src/styles/spartan.scss`: shared `.decision-pill` (Helm badge styling moved out of `duty-card.scss`), tinted for accepted, rejected and pending.
- `src/styles/ui.scss`: shared `.date-chip`, matching the duty card's Due/marks chips.
- Duty card: pill class renamed to `decision-pill` (look unchanged). `DutyStep.completed` holds the completion date; the Completed outcome shows it as a `.date-chip` with `lucideCircleCheck`; the detail line "Accepted · …" is gone.
- Case card (decisions page and captain's veto queue): the Outcome panel shows an `hlmBadge` pill with the case status (ACCEPTED / REJECTED / SUPERSEDED) instead of the resolution sentence, then the resolved date as a `.date-chip` (circle-check for accepted, circle-x for rejected, circle-slash otherwise), then the viewer's own response. `.closed-result` removed.
- Tests: `duty-card.spec.ts`, `case-card.spec.ts`, `e2e/evidence-cases.spec.ts` follow the new markup.

## Checks run

- `ng build` (Node 24 via `npx node@24`): success, no warnings.
- `ng test --watch=false`: 558 passed.
- Playwright `evidence-cases` (preinstalled Chromium, temporary config override): 3 passed.
- Screenshots: duty Completed outcome and an upheld-veto REJECTED case at 390 px; 320 px has no horizontal overflow.

## Unresolved / next steps

- The duty card's submission line still shows the resolution sentence (e.g. "Accepted automatically: no veto within 24 hours"); `CaseView.outcome` is no longer shown on the case card but stays in the model.
