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

Regenerate from `apps/web` with `node scripts/import-urc.mjs`, which writes both `apps/web/src/app/core/competition/urc-fixtures.ts` and `apps/api/app/competitions/urc_2026_27/schedule.json` (run Prettier on the TypeScript file afterwards). Replace the source only after a successful, complete public feed request and update retrieval metadata and relevant assertions when refreshing. The importer fails before writing when completeness validation fails. This snapshot is bundled into the frontend and does not implement background synchronization, official results ingestion or house deadline confirmation.

## Teamsheets

The API's teamsheet provider (`apps/api/app/matchcentre/providers/teamsheets.py`) queries the same endpoint with `matchstats(match_id: [id])` and selects `homeTeam.players { name knownName firstName lastName position { name shirtNumber onFieldName } }`, the shape confirmed by introspecting the feed on 23 September 2026. The feed has no captain flag. If the feed changes, the API's `teamsheets` section reports the GraphQL errors and the current field names under `feedErrors` and `feedFields`.

## Live scores

The API's score provider (`apps/api/app/matchcentre/providers/scores.py`) queries `matchstats(match_id: [...])` for every fixture of a round and reads `match_status`, `match_period`, `stats_data { matchStatus period minute timerRunning finalised homeTeam { id score { currentScore htScore } } awayTeam { ... } events { id minute second time display type { name } period { name } team { id } player { name } } }`, confirmed by introspection on 25 September 2026. Completed seasons 2021/22 to 2025/26 all report `result`, `post match`, `periodTypeId` 150 and `finalised` 1; pre-match fixtures report `fixture` and `pre match`. Event types seen: `period` (first half start/end, second half start/end, match end), `try` (try, penalty try), `goal kick` (conversion, penalty goal, drop goal and their misses), `card` (yellow, red), `sinbin end` and `substitution`. When the feed fails the API falls back to ESPN's public scoreboard for states and scores (see `apps/api/app/matchcentre/providers/espn.py`). The in-play values were not observed on 25 September 2026 because the feed timed out from five minutes before kickoff and Cloudflare then blocked the watcher; `scripts/watch-urc-live.py` records them during a live round (`python3 scripts/watch-urc-live.py <round> <out_dir> <stop ISO time> [interval]`).
