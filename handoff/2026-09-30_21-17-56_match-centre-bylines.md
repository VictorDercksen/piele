# Match centre: teamsheets checked pill and preview byline

## Request

Restyle the dates on the preview and teamsheets; for the preview show an agent icon and name
(open to a better idea). Show a screenshot before opening a PR.

## Changes

- `teamsheets-panel`: the "URC match centre · checked …" line is an outline status pill with
  `lucideRefreshCw`, "Checked d MMM HH:mm z"; the source is its `title`. Hidden when there is no
  `fetchedAt`.
- `match-preview`: the "As of …" note is a byline footer: the Pavilion flag mark in a round
  badge, "The Pavilion agent", "Read from N public sources and the published teamsheets. It can
  be wrong.", and a "Written d MMM HH:mm z" pill (`lucidePenLine`). Grid layout; under 600 px the
  pill drops under the text.
- e2e: `Checked 23 Sep 13:30 SAST`; the Published pill is scoped to `.section-title`.

## Checks run

- `ng test --watch=false`: 116 files, 572 passed. `ng build`: no warnings.
- Playwright `match-centre`, `live-scoring`, `superbru`: 14 passed.
- Screenshots (390 and 1024 px) sent to the user: the teamsheets pill in the real page; the
  preview byline as its markup and compiled styles inside a copy of a panel (the preview only
  renders in API + Supabase builds).

## Open

- Awaiting the user's review of the screenshots before the PR.
- The forecast footer still reads as text.
