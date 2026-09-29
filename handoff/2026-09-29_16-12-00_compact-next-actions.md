# Home: compact "Your next move."

## Request

The home screen's duty and captain blocks took too much space. After reviewing four options on a design canvas, the member chose option B (chip rail): a compact duty bar in the duty's own style (the spoon keeps its timber look), chips for waiting items, and no section at all when nothing needs the member.

## Changes

- `next-actions.html`: replaced the large duty slip, the "No duties for you" card and the full-width queue banners with:
  - a compact `.duty-feature` bar (eyebrow "Your duty · <status>" or "The Spoon · <status>", title, one status line, and an icon-only "Upload evidence" button while the duty is open, pending a deadline or overdue; otherwise a trailing arrow). The text links to `/duties`. `.spoon-duty` still applies, so the global timber rule in `src/styles/ui.scss` styles it.
  - `.action-chips`: "Evidence to vote on", "Veto to rule on" and "Captain review" pills with counts, each shown only when its count is above zero, linking where the old banners did.
- `next-actions.ts`: computed `duty` (hidden once completed or voided), `voteCount`, `rulingCount`, `captainCount`, `visible`; `status(duty)` gives the one-line state; host class `empty` when nothing shows. Removed the unused `duties` output and the `closes` helper; services are now private except those the template reads.
- `next-actions.scss`: rewritten for the bar and chips; `:host(.empty)` hides the section.
- `home.page.html`: `<app-next-actions class="next-actions">` sits directly in the grid (the wrapping `<section>` is gone) and no longer binds `(duties)`.
- `home.page.scss`: when the section is empty on desktop, the feed moves up beside the standings instead of leaving column 1 blank.
- e2e: `evidence-cases.spec.ts` follows the new chip names; `season-timeline.spec.ts` checks the bar's "The Spoon" / "Under review" / "Members vote until" copy instead of the removed name and "Over to the league." heading.

## Checks run

- `npx ng build`: success.
- `npx ng test --watch=false`: 557 passed.
- `npx playwright test` (full suite, with the preinstalled Chromium via a temporary config override): 72 passed.
- Screenshots of the sample league at 390 px, 320 px and 1280 px for Round 01 (section hidden), Round 02 (spoon duty plus two chips) and the Pofadder Bowl Round 02 (chips only); no horizontal overflow.
- `npx prettier --write` on the changed files.
- Node 22.22.2 in this environment is below Angular CLI's minimum; the checks ran on Node 24 via `npx node@24`.

## Unresolved / next steps

- A non-spoon duty bar was not seen in the sample data for the signed-in member; it uses the member colour and accent as the old card did.
- A completed or voided duty no longer appears on home; the member finds it under Duties.
