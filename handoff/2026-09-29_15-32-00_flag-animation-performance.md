# Notifications flag: smoother unroll

## Request

The notifications flag's opening animation lagged on the member's phone (screen recording). Make it run smoothly on any device.

## Cause

- The cloth ran an SVG `feTurbulence` + `feDisplacementMap` filter, animated through SMIL, over the whole fabric while it dropped. Browsers compute SVG filters on the CPU and re-rasterise the filtered content (all the text) every frame.
- The drop progress was a registered custom property (`--unroll`) driving `clip-path` on the cloth, `top`/`height` on the roll and `background-position` on its seams: a repaint (and for the roll, a layout) on every frame.
- `filter: drop-shadow` on `.assembly` recomputed the shadow of the whole moving subtree each frame.

## Changes

- `notifications-flag.scss`: everything that moves now animates only `transform` and `opacity`, which the compositor runs without repainting.
  - Reveal: `.cloth` is an `overflow: clip` box that slides down while `.fabric` slides up by the same amount, so the fabric holds still and only the clip moves.
  - Roll: a new `.roll-track` sits a cloth's height above the cloth and slides down it (so it never adds scrollable area at rest); the roll thins by `scaleY` and its seams move by `translateY`.
  - Shadow: a `box-shadow` on `.swing::before`, stretched with the drop, replaces the drop-shadow filter.
  - The shared progress curve lives in `$unroll-steps`; the `unroll-keyframes` mixin generates `<part>-unroll` and `<part>-rollup` keyframes for each part with identical offsets and easings, so the counter-moving parts cancel exactly.
  - Reduced motion: unchanged behaviour (no animation, cloth shown open, roll and folds hidden).
- `notifications-flag.html`: removed the SVG ripple filter; wrapped `.roll` in `.roll-track`.
- `notifications-flag.ts`: removed the ripple restart; `settled` now only fades the spent roll.
- The fine ripple distortion is gone; the travelling fold shading (`.fall-shading`) and the swing remain.

## Checks run

- Frame timing in headless Chromium (Playwright script, three openings each), phone 390 px at 3x DPR with 6x CPU throttling: average frame 58.8 ms before, 18.2 ms after; frames over 33 ms per three runs 64 before, 8 after. Desktop 1440 px unthrottled: 37.6 ms before, 17.9 ms after.
- Screenshots mid-drop, at rest and during roll-up at 390 px and desktop; document scroll height and width unchanged by opening and closing at 390 px and 320 px.
- `npx prettier --check` on the component, `npx ng build` (no warnings), `npx ng test --watch=false`: 557 passed.
- Playwright e2e suite not run: the pinned Playwright expects a Chromium build not installed in this environment.

## Next steps

- Check on the member's phone that the drop is smooth; if the ripple is missed, a transform-based wobble could stand in for it.
