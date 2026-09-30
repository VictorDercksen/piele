# More page: season and captain pills

## Request

Remove the league card (crest, name, season, captain, time zone) from the top of the More page and show only the season and the captain as pills with an icon.

## Changes

- `features/more/more.page.html`, `.scss`, `.ts`: the club card is gone. A `ul.league-pills` (labelled "League") shows the season with `lucideCalendarDays` and "Captain <name>" with `lucideCrown`, each a rounded pill. The pills wrap onto two lines at 320 px. The league name, crest and time zone no longer appear on this page. `LeagueCrest` and `LeagueTime` are no longer imported.
- `e2e/leagues.spec.ts`: the captain checks read `.league-pills` ("Captain Doempie", "Captain Victor Dercksen"). The Pofadder Bowl check of the league name on this page is replaced by the URL check.

## Checks run

- `ng build` (Node 24): success, no warnings.
- `ng test --watch=false`: 115 files, 569 passed.
- Playwright `leagues`, `match-centre`, `season-timeline`, `evidence-cases`, `superbru`, `stadium-backgrounds` (temporary config, dev server on 4300): 43 passed.
- Screenshots at 390 px and 320 px: no horizontal overflow.

## Unresolved / next steps

- The time zone ("Times in SAST") is no longer shown on the More page.
