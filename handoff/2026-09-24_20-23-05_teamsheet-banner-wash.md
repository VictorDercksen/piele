# Teamsheet banner wash, flags and ages

## Request

Improve the match centre teamsheets: show each player's nationality and age next to their name, each team's average age, and a team-styled background. The user reviewed four mockups (colour rail, banner wash, kit card, formation) and chose the banner wash, with a flag instead of a country code, as the stadium does. Country of birth is acceptable as nationality.

## Completed

- API (`app/matchcentre/providers/teamsheets.py`): after the lineup query, one batched `players(id: [...], limit: n)` query fetches `dob` and `countryOfBirth` for every lineup player id. Each player gains `dateOfBirth` (`YYYY-MM-DD` or null) and `birthCountry` (feed name or null). A failed lookup logs and leaves both null; the teamsheet stays `ok`. The internal feed `id` is not returned. The feed's `nationalTeam` field fails server-side, so it is not queried. Verified against the live feed for fixture 292584 (Benetton v Dragons): 46 of 46 players have a birth date, 43 a country.
- Tests (`tests/test_matches.py`): the fake feed answers the bio query; assertions cover merged fields, missing country, unreadable date, players missing from the bio feed, one batched lookup, and a failed lookup keeping the teamsheet.
- Web model: `TeamsheetPlayer.dateOfBirth` and `birthCountry` are optional, because snapshots cached before this change lack them.
- `core/competition/countries.ts`: feed country name to flag (`countryNamed`). Covers every birth country in the 2026/27 squads plus other rugby nations. Northern Ireland uses the `gb` flag, as in `stadiums.ts`.
- Flags: 38 flag-icons 7.2.3 SVGs (4x3) added to `public/assets/images/flags`; `sources.json` lists all 44.
- `features/match/teamsheet.ts`: `sheetView` builds each side (club banner and accent, ages at kickoff, flags, starters' and replacements' average ages). The feed's "sub 1" to "sub 8" bench positions are hidden. Unit tests in `teamsheet.spec.ts`.
- `match.page`: each sheet shows the club banner pattern fading in from the top, a faint crest watermark, the crest beside the team name, "XV avg age" in the header and the replacements' average on the bench label. Rows show the flag (alt and title are the country name) and age after the name. Shirt numbers use the club accent. Clubs without banner artwork keep the plain sheet.
- `club-banners.ts`: `ClubBanner` is exported.
- `e2e/match-centre.spec.ts`: asserts flags, ages, the average age, banner styling and hidden bench slots.

## Checks run

- `uv run pytest` (apps/api): 26 passed, 22 skipped (database tests).
- `npx -y node@24 node_modules/.bin/ng build`: passed, no warnings.
- `npx -y node@24 node_modules/.bin/ng test --watch=false`: 12 files, 39 tests passed.
- Playwright with the preinstalled Chromium (`/opt/pw-browsers/chromium-1194`) through a temporary config serving with Node 24: 15 passed.
- A temporary spec screenshotted the panel with live Benetton v Dragons data at 1440 px and 320 px with no horizontal overflow; the spec and config were removed afterwards.
- Prettier check on changed web files: clean after `prettier --write`.

## Next steps

- Teamsheet snapshots cached before deployment (six-hour TTL) show no flags or ages until they refresh.
- A birth country missing from `countries.ts` shows no flag; add the name and its flag-icons SVG when one appears.
