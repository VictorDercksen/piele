# URC 2026/27 schedule snapshot

Retrieved on 23 September 2026 from the public GraphQL feed used by the [official URC match centre](https://stats.unitedrugby.com/). The published [full fixture list](https://www.unitedrugby.com/latest/news/2026-27-fixtures-in-full/) and [IRFU season announcement](https://www.irishrugby.ie/2026/05/19/bkt-urc-fixtures-released-for-2026-27-season/) supplied cross-checks and playoff windows.

The saved `urc-2026-27-source.json` contains the response to this read-only query at `https://www.unitedrugby.com/graphql`:

```graphql
query {
  matchstats(season_id: [202601]) {
    match_id
    match_datetime
    match_status
    stats_data {
      tbc
      dateTime
      id
      round
      homeTeam { team { id name } }
      awayTeam { team { id name } }
      venue { timezone name }
    }
  }
}
```

The 151 records contain 144 regular fixtures and seven playoff placeholders. `tbc` records have no confirmed kickoff in the generated application data. Quarter-finals occupy 28–29 May 2027, semi-finals 5 June and the final 19 June. Do not display the feed's placeholder 14:00 timestamps as confirmed playoff times.

Round 8 includes December 2026 fixtures and two February 2027 fixtures. Preserve their round IDs. The feed includes the September amendments, including Glasgow–Ulster on 3 October at 16:30 UTC and Zebre–Sharks on 16 April at 17:30 UTC. Convert absolute UTC values to Africa/Johannesburg for display rather than copying the original article's shared ITA/SA timezone labels.

Regenerate from `apps/web` with `node scripts/import-urc.mjs`, which writes both `apps/web/src/app/core/competition/urc-fixtures.ts` and `apps/api/app/data/urc_fixtures.json` (run Prettier on the TypeScript file afterwards). Replace the source only after a successful, complete public feed request and update retrieval metadata and relevant assertions when refreshing. The importer fails before writing when completeness validation fails. This snapshot is bundled into the frontend and does not implement background synchronization, official results ingestion or house deadline confirmation.

## Teamsheets

The API's teamsheet provider (`apps/api/app/matchcentre/providers/teamsheets.py`) queries the same endpoint with `matchstats(match_id: [id])` and selects `homeTeam.players` and `awayTeam.players`. Those lineup fields have not been confirmed against the live feed. Confirm them with an introspection query from a network that can reach the feed, for example:

```graphql
query { __type(name: "MatchStatsData") { fields { name type { name kind ofType { name } } } } }
```

Adjust `QUERY` in the provider to the real field names. A rejected query surfaces as `teamsheets.status = "unavailable"` in the match centre response.
