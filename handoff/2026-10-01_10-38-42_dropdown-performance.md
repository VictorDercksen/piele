# Dropdown performance with filled content

## Request

The match centre dropdowns feel quick when empty and slow and clunky when filled, mostly on
mobile and somewhat on desktop. Optimise and fix them, following Angular best practices.

## Causes found (measured in Chromium, 390 px at 3x, CPU throttled 4x, traced via CDP)

- The tap frame restyled every element in the body (238–333 elements):
  - toggling `visibility` (inherited) on the body;
  - toggling `inert` (from both the dropdown and Brain's collapsible content), which is carried
    in every descendant's computed style;
  - the tap-to-open `cursor: pointer` (inherited) changing with the open state (Scoring);
  - Brain's collapsible content writing the inherited custom properties
    `--brn-collapsible-content-height/width` on content resize, which restyled the subtree again.
- Closed bodies were still laid out and walked by paint (1,421 layout objects on the page).
- Every frame of the height animation re-rasterised the panels on screen, and about 40% of that
  raster time was the shared grain texture: `surface-grain.svg` draws its noise with
  `feTurbulence`, recomputed for each repainted tile.

## Changes

- `shared/dropdown/dropdown.scss`: closed bodies use `content-visibility: hidden` (with a
  `visibility` fallback under `@supports not`), so their content is skipped but its rendering
  state kept; tap-to-open cursors only under `@media (hover: hover)`.
- `shared/dropdown/dropdown.ts` / `.html`: `bodyInert = open() === animating()`. The body is
  inert while closed and while it opens, and stays interactive until it has folded, so inertness
  changes at rest rather than in the tap frame. It drives both `[attr.inert]` and the collapsible's
  `[expanded]`. `contentHeight()` lifts `content-visibility` for the height read, which is now
  skipped under reduced motion.
- `styles/spartan.scss`: `@property` registrations make the two Brain size properties
  non-inheriting (nothing reads them).
- `styles.scss` + `public/assets/editorial/surface-grain.png`: `--surface-grain` is the SVG
  rendered at 2x into a lossless palette PNG (152 colours, 83 KB) via `image-set(... 2x)`. The SVG
  stays as the source. Screenshots match the SVG within 4/255 per channel at 2x, 8/255 at 3x.
- `shared/dropdown/dropdown.spec.ts`: a case for the inert timing.

## Results (same harness, averages of 3 runs)

- Elements restyled in the tap frame: 238–333 → 14–17.
- Layout objects on the closed match centre: 1,421 → 705.
- Raster time per animation: Scoring open 423 → 388 ms, Pool picks open 488 → 379 ms,
  Teamsheets open 474 → 291 ms, closes 8–16% lower.
- Dropped frames per animation fell 10–15%. Headless frame timing is noisy; iOS Safari could
  not be tested here. WebKit renders SVG background tiles in software on each repaint, so the
  grain change should matter more there.

Tried and dropped: a compositor layer on the open body's content (`will-change: transform`) gave
no measurable gain. Promoting the panels below an animating dropdown gave a moderate gain but
would put transforms on ancestors of sticky headings, which `apps/web/CLAUDE.md` forbids.

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium via a temporary config)

- `ng test --watch=false`: 122 files, 612 tests passed (before the new spec), then the dropdown
  spec 7/7.
- `ng build`: passed, no warnings.
- Playwright, all specs: 73 passed.

## Next

- Check on a real iPhone (Safari) and an Android phone.
- The scoring pitch still uses `feTurbulence` grass textures and `filter: url(#scoring-chalk)`,
  which cost raster while the Scoring dropdown animates.
- What remains per frame is the height animation itself (layout, paint and raster of the content
  below the dropdown).
