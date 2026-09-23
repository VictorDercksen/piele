# Match centre live on staging: prices removed, feed query fixed

Request (this session, after the plan was approved and merged): make the match centre work on staging. Sequence of user decisions: Supabase migrations replace Alembic; The Odds API turned out not to list the URC, so the user tried API-Sports Rugby; its free plan serves only the 2022 to 2024 seasons, so the user chose to remove prices entirely.

## Completed

- Teamsheet provider query now matches the feed's introspected schema: `stats_data.homeTeam.players { id name knownName firstName lastName position { id name shirtNumber onFieldId onFieldName } }`. Shirt number comes from the position object; starters are shirts 1 to 15; the feed has no captain flag. Staging returns `not_published` with match status "fixture" for Friday's Connacht v Stormers, which is correct until the clubs name sides.
- Diagnostics: a rejected feed query reports `feedErrors` and an introspection of the match, team, player and position types under `feedFields`. Provider HTTP failures report `HTTP <status>`; application-level errors report their message. A stale failure snapshot no longer masks a newer failure.
- `/v1/health` reports `snapshotCache`: `database`, `table missing` or `memory`. Staging reports `database`, and the forecast was served from the cache across requests.
- Prices removed end to end: odds provider, `RUGBY_API_KEY`/`RUGBY_API_URL` settings, the `odds` response section, the frontend `OddsSection` contract, the prices panel and its styles, e2e assertions and API tests. Club catalogue no longer carries bookmaker aliases. Section statuses are now `ok`, `not_published`, `too_early`, `past`, `unavailable`.
- Docs updated: README.md, apps/api/README.md, apps/api/CLAUDE.md, fixtures/README.md, apps/api/.env.example.

## Checks run

- `uv run pytest`: 17 passed.
- `npm run build`: no warnings. `npm test`: 12 passed. `npm run test:e2e`: 13 passed.
- Staging responses pasted by the user confirmed: health database ok and cache in database; weather `ok` (Galway, light drizzle at 21:00 SAST); teamsheets `not_published` from the live feed.

## Notes for the next session

- Provider hosts and Vercel are blocked from the cloud container; live checks depend on the user pasting responses.
- The application plan still lists Alembic and "no betting"; both are now consistent with the code (Supabase migrations, no prices).
- Open-Meteo is called from Vercel's shared egress; watch for HTTP 429 in the weather section under load.
