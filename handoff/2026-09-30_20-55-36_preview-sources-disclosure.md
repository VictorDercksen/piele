# Pavilion preview: Sources as a plain disclosure

## Request

After PR #81 merged, an iPhone screenshot of the open Pavilion preview showed the "Sources" heading
and its chevron drawn over the middle of its own list (items 1–2 above it, 3+ below), with an
empty band where the heading belonged. Fix it in a new PR.

## Cause

Sources was an `app-dropdown` nested inside the preview's `app-dropdown`. A page-section dropdown
brings a sticky heading with its own compositing layer (`translateZ(0)`, z-index 2), a
scroll-back-before-close sequence and pinned-state measuring; none of that belongs inside another
section's body. The screenshot matches the nested heading's layer drawn away from its slot. PR #81
had already stopped the nested heading pinning in Chromium; the preview only renders in API builds
with Supabase configured, and no WebKit is available here, so the exact iOS drawing could not be
reproduced.

## Changes

- `features/match/match-preview/match-preview.{html,ts,scss}`: Sources is a Helm collapsible
  (`hlmCollapsible` / `hlmCollapsibleTrigger` / `hlmCollapsibleContent` with `preserveContent`):
  a full-width row "SOURCES", count pill and a small chevron whose icon rotates; the list folds
  with a `grid-template-rows` transition and is hidden and inert when closed (Brain sets `inert`).
  `sourcesOpen` is a `linkedSignal` on `fixtureId`, so every fixture starts closed. Reduced motion
  drops the transitions.
- `shared/dropdown/dropdown.scss`: removed the nested-heading rule added in #81 (no nesting left);
  the child-combinator comment now says dropdowns do not nest.
- `apps/web/CLAUDE.md`: dropdowns do not nest; a disclosure inside a section body is a Helm
  collapsible.
- `match-preview.spec.ts`: the sources start closed and inert, open and close from the row, and
  reset for another fixture.

## Checks run (Node 24 via npx; Playwright with /opt/pw-browsers/chromium via a scratch config)

- `ng test --watch=false`: 116 files, 572 tests passed.
- `ng build`: complete, no warnings. Prettier check clean.
- Playwright `match-centre`, `live-scoring`, `superbru`: 14 passed.
- The compiled preview SCSS in a static page in Chromium at 400 px: closed body 0 px and hidden,
  open 215 px for five sources with the icon rotated, folds back to 0 and hidden.

## Unresolved / next steps

- Check on the iPhone once deployed: open the preview, open and close Sources while scrolled.
- The production screenshot was taken three minutes after #81 merged; it may have been the old
  build still loaded in the page.
