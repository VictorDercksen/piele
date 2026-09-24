# Matchup switch lag and jitter on Home

Recorded on 2026-09-24 in Africa/Johannesburg time. Paths are relative to the repository root. Continues `2026-09-24_16-30-00_duties-auth-feed.md`. Branch `claude/vigilant-hamilton-a38nuh`.

## Request

Fix the slight lag and jitter in the Home match hero when the current matchup is changed in the fixture ribbon (screen recording supplied), and open a PR.

## Cause

The hero reused its `<img>` elements. On a switch the club names, colours, kickoff and venue changed immediately, while the crests, background patterns and stadium flag kept the previous club's artwork until the new files loaded and decoded. Frame analysis of the recording showed about 3–4 frames of, for example, Sharks and Ospreys crests on Munster and Glasgow colours before the new art popped in. A browser probe against the dev server (10 Mbps, 150 ms latency) measured 21–33 such frames per switch.

## Completed

- `apps/web/src/app/core/competition/match-artwork.ts`: `matchArtwork(fixture)` lists the hero's images (both clubs' pattern and crest, the stadium flag). `MatchArtwork` service loads and decodes them with `Image.decode()`, keeps the elements so they stay in the memory cache, and exposes a signal-backed `ready(fixture)`. A failed or slow image counts as settled after 600 ms, so a switch never waits longer than that. `warm(fixtures)` loads a round's artwork once the browser is idle.
- `apps/web/src/app/features/home/match-hero`: the template renders `shown()`, a `linkedSignal` that keeps the previous fixture until the next fixture's artwork is ready, so names, colours and images change in one frame. The first fixture renders immediately. An effect preloads the incoming fixture.
- `apps/web/src/app/core/layout/fixture-ribbon/fixture-ribbon.ts`: warms the selected round's artwork when idle, and preloads a matchup on pointer enter or focus.
- `apps/web/src/app/core/competition/match-artwork.spec.ts`: artwork list, readiness after decode, the 600 ms cap and idle warming.

## Checks run

Node 22.23.2 downloaded to the scratchpad (the container's 22.22.2 is below the CLI minimum).

- `ng test --watch=false`: 32 passed.
- `ng build`: passes, initial 612 kB, no warnings.
- Playwright (dev server on 4300, Playwright 1.63 pointed at the container's Chromium 1194 headless shell): 15 passed. `test:e2e:production`: 3 passed.
- Frame probe (rAF sampler counting frames where a hero image is not yet decoded): before the fix 21–33 frames per switch; after, 0 on every switch, with swaps 2–17 ms after the click once the round is warm. Without warming, a first visit to a matchup at 10 Mbps swapped after 250–550 ms, still in one frame.

## Open items

- Warming fetches all club artwork (about 2.6 MB, every round contains all 16 clubs) once per browser. Most of it is the 1920×1080 pattern JPEGs, shown at about 370×280 and 30% opacity. Resizing them (and the 275 kB Sharks crest SVG) would cut that substantially. Not done here.
