# Fixed bottom navigation and scroll to top on page changes

## Request

A recording: from the middle of the home page, tapping Duties (a short page) made the whole
bottom navigation move, and it looked as if one could scroll past it. Fix it and go through the
parent and child components so bugs like these are gone and a proper hierarchy is kept.

## Cause

The mobile navigation was the last row of the shell's `.league` grid, `position: sticky;
bottom: 0`. Navigating kept the old scroll position (1000+ px) while the new page was much
shorter, so the document ended above the viewport; iOS animates the scroll back into range, and
a sticky bar can only stick within its container, so it rose with the document's end, leaving
blank space under it. The same happens whenever content shrinks under the reader (a round with
less content, the last dropdown on a page folding).

## Completed

- `core/layout/shell/shell.html|scss|ts`:
  - The mobile navigation is a sibling of the `.league` grid, `position: fixed; inset: auto 0 0`,
    shown by a media query at 1050 px (it has no container ancestor to query). The grid drops
    its `nav` row and pads its bottom by `--nav-height`, which the shell's `ResizeObserver` now
    measures alongside `--sticky-offset`.
  - The shell's colours and type moved from `.league` to `:host` so the bar shares them; the
    host keeps `container-type: inline-size` (inline-size containment only, so it is not a
    containing block for the fixed bar). `.league` must never carry a `filter` or `transform`.
  - On every `NavigationStart` that changes the path and is not a back/forward, the shell scrolls
    to the top, before the leaving page is replaced (a scroll alone, then a layout change alone).
- `features/match/match.page.ts`: its own scroll-to-top for a fixture switch is gone; the
  shell's covers it (the e2e check for it still passes).
- e2e (`season-timeline.spec.ts`): from 1200 px into the home page, tapping Duties on a phone:
  the bar is `fixed`, its bottom edge never leaves the viewport's bottom in any frame across the
  navigation, the page lands at the top, and the footer clears the bar at the page's end.
- `apps/web/CLAUDE.md`: the shell hierarchy and the scroll-to-top rule.

## Hierarchy (after)

```
app-shell (:host: container, colours, type)
├── .league (grid: rail | top bar | main; padding-bottom: --nav-height on phones)
│   ├── aside.season-rail (desktop: sticky, full height)
│   ├── header.top-bar (sticky top 0, z 4)
│   └── main.main-content (isolation; backdrop z -2; gradient z -1)
│       ├── .round-bar (sticky under the top bar, z 3; ribbon drawer inside)
│       ├── .page-heading, .page-body (router outlet), footer
└── nav.mobile-nav (fixed to the viewport bottom, z 3; phones only)
```

## Checks run (Node 24 via npx; Playwright with the preinstalled Chromium via a temporary config)

- `npm test -- --watch=false`: 43 files, 286 tests passed.
- `npm run build`: passed, no warnings.
- Playwright (Chromium): the full suite, 54 passed; the new bottom-bar test repeated three times, 3 passed.

## Open

- Verify on an iPhone: from deep in the home page, tap Duties; the page should open at the top
  with the bar still at the bottom, and overscrolling at a page's end should leave the bar put.
