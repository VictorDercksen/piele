# Jev backtest

Phase F of the match preview plan: check whether Jev's probabilities would have made good Superbru picks before the Machine's placement means anything. Nothing here is implemented yet. The implementation plan is in [handoff/2026-09-25_10-11-21_match-previews.md](../handoff/2026-09-25_10-11-21_match-previews.md#jev-backtest-planned).

## Question

Replay past URC matches with only the information available before kickoff. For each match, ask Jev the production question set, derive the Machine's pick with the API's own pick function, and compare it with simple baselines on:

- Superbru-style points: win point and margin point (within 5), per round and per season. Bonus points are left out, as they are for the Machine, because they depend on the pool.
- Probability quality: log loss and Brier score on home, draw or away; ranked probability score on the 13 margin bands; calibration by probability bucket.

## Data

The public URC GraphQL feed still serves five past seasons (checked 25 September 2026): `season_id` 202101 to 202501, 151 matches each (regular season and playoffs), every one with `home_score`, `away_score`, `match_datetime`, `venue` and 23-player line-ups. Kickoff forecasts as they were issued come from Open-Meteo's historical forecast API. There is no historic news, so the backtest has no team research or mood.

## Rules

- Pre-kickoff data only: line-ups of the match itself, and results, line-ups and form from matches that kicked off earlier.
- The same state builder, Jev request and pick function as production, imported from `apps/api`, so results carry over.
- Results are reported with the leakage caveats below, never as a forecast accuracy claim on their own.

## Known leakage

- Line-ups in the feed are the final match-day sheets, which can include late changes after the 48-hour announcement.
- Jev was released in September 2026 and its training data may include these results. Every run is repeated with team, player and venue names replaced, and the real test is the 2026/27 season scored as it happens.

## Layout (planned)

| Path | Purpose |
| --- | --- |
| `data/` | Downloaded feed and forecast responses. Git-ignored. |
| `collect.py` | Downloads seasons, line-ups, scores and forecasts into `data/`, once. |
| `replay.py` | Builds each match's pre-kickoff state, calls Jev and baselines, writes one row per match and model. |
| `baselines.py` | Home by 7, table position, and an Elo rating with home advantage. |
| `score.py` | Superbru points and probability metrics from the replay rows. |
| `results/` | Committed summary tables and the run's settings, one folder per run. |
