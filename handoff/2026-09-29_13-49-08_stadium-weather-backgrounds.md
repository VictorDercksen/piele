# Stadium backgrounds follow the kickoff forecast

## Request

Victor supplied a weather pack (`C:/Users/victo/Documents/Codex/2026-09-25/cou-2/outputs/urc-stadium-weather-pack/png`, 78 images) and asked for backgrounds to follow each matchup's forecast. Without a forecast, show the clear day or night scene. The profile and the favourite-team page backgrounds should adapt to the current round.

Victor's answers:

- The profile always shows the selected team's stadium.
- Other pages follow the favourite team's match venue.
- Without a forecast, the kickoff time decides day or night.

## Changes

- Assets: `apps/web/public/assets/images/stadium-weather/<team-id>/<condition>.webp`.
  - WebP q82, 1536 x 1024, 21.5 MiB in total. Provenance is in `sources.json`.
  - Conditions are `sunny-day`, `overcast-day`, `night-dry`, `rainy-night` and `snow-day`. Sharks and Stormers have no `snow-day`.
  - `match-nights/` is deleted. Its images were the `rainy-night` originals.
- API: `GET /v1/competitions/{competitionId}/rounds/{round}/weather` (`MatchCentreService.round_weather`).
  - It returns every fixture's `status`, `weatherCode`, `isDay` and `forecastHourUtc`, using the existing 3 h weather snapshots fetched in parallel.
  - A failure for one fixture reports `unavailable` for that fixture only.
  - No membership is needed, the same as `/scores`.
- Mapping (`core/competition/stadium-weather.ts`):
  - No forecast, clear or partly cloudy: `sunny-day` by day, `night-dry` by night.
  - Cloudy or fog: `overcast-day` by day, `night-dry` by night.
  - Drizzle, rain or storm: `overcast-day` by day, `rainy-night` by night.
  - Snow: `snow-day` day or night. A club without snow artwork uses its rain scene.
- Day or night (`core/competition/daylight.ts`): the forecast's `isDay`, otherwise the sun's elevation at the venue's coordinates at kickoff. The current time is used only when there is no fixture or kickoff.
- `SkyScene` and `skyScene()` moved to `core/competition/sky-scene.ts`. `weather-sky.ts` imports them.
- Services:
  - `core/api/round-weather.service.ts`: an `httpResource` for the selected round.
  - `core/competition/stadium-scene.service.ts`:
    - `fixtureBackground`: home and match pages. Venues without artwork keep the editorial fallback.
    - `favouriteBackground`: other pages. Uses the favourite's round fixture venue. If that venue has no artwork, uses the home ground with that fixture's weather. On a bye, uses the home ground at the current time.
    - `homeGroundBackground`: the profile. Uses the forecast only when the fixture is at the home ground.
- `MatchArtwork` preloads the resolved URL. The match hero updates at once for the same fixture when a late forecast changes the background.
- Removed `ClubTeam.stadiumBackground` and `StadiumCatalogue.background`. Added `stadiumBackgrounds`, `backgrounds(venue)`, `position(venue)`, `home(teamId)` and `Stadium.club`.

## Checks

- API `uv run pytest -q`: 96 passed, 140 skipped (database tests, no `PIELE_TEST_DATABASE_URL`).
- Web `npm test -- --watch=false`: 111 files, 557 tests passed.
  - One unidentified failure appeared once in an earlier Phase 1 run and did not recur in three reruns.
- `npm run build`: passes, no warnings.
- `npm run check:api`: types match.
- Targeted e2e (run by the implementing agent, port 4317): 36 passed across these specs:
  - `stadium-backgrounds`
  - `profile-and-layout`
  - `match-centre`
  - `live-scoring`
  - `club-names`
  - `mobile-round-picker`
  - `season-timeline`
- Full e2e suite: not completed. The run was stopped when the machine ran low on memory, and its failures were browser crashes (`Target crashed`), not assertions.

## Notes

- The development environment points at `http://127.0.0.1:8000`, so e2e and dev servers request the weather endpoint.
  - `stadium-backgrounds.spec.ts` mocks it with a 503 by default and pins the clock before round 1.
  - One test mocks a rain forecast.
  - `profile-and-layout.spec.ts` also pins the clock.
- When the team is away, the profile poster takes day or night from the sun at the home ground at the fixture's kickoff.

## Next steps

- Run the full e2e suite on a machine with more free memory.
- Consider whether 21.5 MiB of artwork in the repo is acceptable, or whether the images should move to storage or a CDN.
