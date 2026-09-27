# Edit pick design options

## Request

Improve the look and layout of the match centre's edit pick section (the "Pool picks." panel's
form: side radiogroup, margin, Save pick), which reads plainly beside the scoring panel and the
teamsheets. The request was for an artifact with a few options to choose from, not a change to the
app yet.

## Completed

- Published a private artifact, "Pool Picks Form Options", at
  https://claude.ai/artifact/X8TtHcN3Ktt2yjktNLKPCi. It rebuilds the current form and mocks
  three options in the app's palette, Titillium Web, the dropdown panel's grain card, the
  rugby-button texture and the real Leinster and Stormers jerseys and crests (inlined). Each
  mock is interactive (sides, stepper, chips, the range) and a Desktop / Phone toggle previews
  the 720 px and 360 px panel widths.
  1. Club banners (recommended): the two sides as match-hero style club banners with a vertical
     Draw between them; margin as a − / + stepper with a "Reads: Leinster by 12" line.
  2. Margin scale: side and margin as one signed range on the scoring panel's points tab, crests
     either side, fill growing from the middle like the sway bar; an exact field for 41 to 150.
  3. Pick slip (smallest change): the existing tiles on a chalk-edged deep slip, with crest and
     brass tick, quick-margin chips (3, 7, 10, 14, 20) beside a small stepper and a read-back line.
- No application code changed.

## Relevant files

- `apps/web/src/app/features/match/picks-panel/picks-panel.html`, `.scss`, `.ts` (the form).
- `apps/web/src/app/features/match/scoring-panel/scoring-panel.scss` and
  `apps/web/src/app/features/home/match-hero/match-hero.scss` (the language the options draw on).
- `apps/web/src/app/shared/dropdown/dropdown.scss` (the panel appearance the mocks reproduce).

## Checks run

- The artifact page was rendered once in the container's Chromium (Playwright, file URL) at
  1180 px and at the phone toggle; both looked right. No app build or tests were run because
  nothing in the app changed.

## Unresolved and next steps

- The owner picks an option (or a mix; banners with the quick-margin chips pairs naturally).
- Implementing any option touches `picks-panel.html/.scss` and the picks panel spec; option 2
  also changes `picks-panel.ts` (one signed value driving side and margin) and the e2e that
  fills the form.
