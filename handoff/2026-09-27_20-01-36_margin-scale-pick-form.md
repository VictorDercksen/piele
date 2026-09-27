# Margin scale pick form

## Request

From the three options in the earlier artifact (handoff `2026-09-27_19-48-23`), the owner chose
the margin scale: side and margin as one control on a strip in the scoring panel's shape, and a
pull request.

## Completed

- `apps/web/src/app/features/match/picks-panel/picks-panel.html`: the radiogroup and the bare
  margin box are replaced by the scale. A strip (`.scale`) with a crest button at each end
  ("One point toward {club}") and a track between them carrying an unseen native range
  (`#pick-scale`, labelled "Your pick", `aria-valuetext` "Stormers by 7" / "A draw" / "No pick
  yet", `aria-invalid` on an empty submit), ticks at 40, 20, Draw, 20, 40, a fill from the
  middle in the club's banner colour and a marker chip (the margin, "Draw", or a dashed "Pick"
  before a side is chosen). Under it a "Reads" line with the pick in words (or a hint), a "Draw"
  chip (`aria-pressed`) and the typed "Margin (points)" field (unchanged id, disabled for a draw
  with its hint). Then Save pick, Cancel while editing, and the note with a lock icon.
- `picks-panel.ts`: `SCALE_REACH` (40), `parseMargin` (exported), `scale` computed (`ScaleView`:
  range value, marker position, fill edges, labels and the pick in words), `slide` (range
  input: negative is home, zero a draw), `nudge(side)` (one point toward that crest, through a
  draw), `pickDraw`, `setSigned`. Every path writes the same `side` and `margin` controls, so
  validators, the alert cards and `describe` are unchanged. Edit focuses the range; an empty
  submit flags the strip (the range is transparent, so an outline on it would not show).
- `picks-panel.scss`: the scale, ends, track, fill, marker, draw chip and reading; phone sizes
  in the container query (54 px ends, the 20 labels hidden).
- `picks-panel.spec.ts`: the helpers drive the crests, the Draw chip and the range; a new test
  covers the marker's reading, the fill, a margin beyond the reach parking at the end, nudging
  through the middle to a draw and the range's middle as a draw.
- `e2e/superbru.spec.ts`: the pick journey uses the slider, the crest and the Draw chip, checks
  the flag on the strip, and presses ArrowRight while editing (toward the away side).
- `apps/web/CLAUDE.md`: the picks panel sentence describes the scale.

## Checks run

Under `npx --yes node@24` (the container's Node is below the CLI's minimum):

- `ng build`: passed, initial bundle 737.99 kB (budget 740 kB).
- `ng test --watch=false`: 55 files, 348 tests passed.
- Prettier: the changed files are formatted.
- Playwright against `ng serve` on 4330 with a scratch config pointing at
  `/opt/pw-browsers/chromium`: `superbru.spec.ts` 6 passed; the full suite result is below.
- Screenshots of the real form at 1180 px and 390 px (empty and "Stormers by 12") live in the
  session's scratchpad.

- Full Playwright suite, same set-up: 57 passed (2.2 min). `npm run test:e2e:production` was not run.

## Unresolved and next steps

- The initial bundle sits 2 kB under budget; the next root addition needs the budget raised
  or another deferral.
- Dragging the marker on a phone competes with vertical page scroll on the track; the crests,
  the Draw chip and the typed field cover a member who would rather not drag. Worth a check on
  a real phone.
- The range's keyboard step is one point; PageUp and PageDown step ten (native).
