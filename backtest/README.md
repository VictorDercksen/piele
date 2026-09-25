# Jev backtest

Phase F of the match preview plan: check whether Jev's probabilities would have made good Superbru picks before the Machine's placement means anything. The plan is in [handoff/2026-09-25_10-11-21_match-previews.md](../handoff/2026-09-25_10-11-21_match-previews.md#jev-backtest-planned).

The code is in place and the baselines have been run. Jev has not been called yet: that needs a TypeSafe API key (see [Running](#running)).

## Question

Replay past URC matches with only the information available before kickoff. For each match, ask Jev the production question set, derive the Machine's pick with the API's own pick function, and compare it with simple baselines on:

- Superbru-style points: win point and margin point (within 5), per round and per season. Bonus points are left out, as they are for the Machine, because they depend on the pool. Grand slams are counted but not added, because their value varies by round.
- Probability quality: log loss and Brier score on home, draw or away; ranked probability score on the 13 margin bands; calibration by probability bucket.

## Data

The public URC GraphQL feed still serves five past seasons (checked 25 September 2026): `season_id` 202101 to 202501, 151 matches each (regular season and playoffs), every one with `home_score`, `away_score`, `match_datetime`, `venue`, try events and 23-player line-ups. Kickoff forecasts come from Open-Meteo's Historical Forecast API. That API has no rain-chance field, and its values come from short-lead model runs, so they are more accurate than the two-day-ahead forecast production sees. There is no historic news, so the backtest has no team research or mood.

## Rules

- Pre-kickoff data only: line-ups of the match itself, and results, line-ups and form from matches that kicked off earlier. `build_state` wraps every data source in `BeforeKickoff`, which raises rather than pass on anything from kickoff onward; `apps/api/tests/test_machine.py` proves it.
- The same state builder (`app/agent/state.py`), Jev request (`app/agent/jev.py`), pick function (`app/agent/pick.py`) and scoring (`app/agent/scoring.py`) as production, imported from `apps/api`, so results carry over.
- 2021/22 tunes the baselines only. Results are reported for 2022/23 to 2025/26. Jev is not tuned.
- The decision rule is written down before the first Jev run: [results/decision-rule.md](results/decision-rule.md).
- Results are reported with the leakage caveats below, never as a forecast accuracy claim on their own.

## Known leakage

- Line-ups in the feed are the final match-day sheets, which can include late changes after the 48-hour announcement.
- Jev was released in September 2026 and its training data may include these results. Every run is repeated with team, player and venue names replaced (the anonymised arm), and the real test is the 2026/27 season scored as it happens.

## Layout

| Path | Purpose |
| --- | --- |
| `data/` | Downloaded feed and forecast responses, and cached Jev answers. Git-ignored. |
| `collect.py` | Downloads seasons, line-ups and forecasts into `data/`, once. Resumes where it stopped. |
| `archive.py` | The downloaded seasons as a data source for the API's `build_state`. |
| `anonymise.py` | Stable per-season pseudonyms for clubs, players and venues, and a check that no real name is left. |
| `replay.py` | Builds each match's pre-kickoff state, calls Jev (both arms) and the baselines, writes one row per match and model. |
| `baselines.py` | Home by 7, table position, and an Elo rating with home advantage. |
| `score.py` | Superbru points and probability metrics from the replay rows, with intervals from resampling rounds. |
| `results/` | Committed summaries, per-match rows and the run's settings, one folder per run. |
| `tests/` | Archive, anonymisation, baseline and metric tests. They run with the API's `pytest`. |

## Running

From the repository root, with the API environment (`npm run setup:api`):

```sh
uv --directory apps/api run python ../../backtest/collect.py                 # about 30 minutes, once
uv --directory apps/api run python ../../backtest/replay.py --run 2026-09-25 --limit 5
uv --directory apps/api run python ../../backtest/replay.py --run 2026-09-25
uv --directory apps/api run python ../../backtest/score.py --run 2026-09-25
```

- Jev needs `TYPESAFE_API_KEY`, from the environment or a git-ignored `backtest/.env` (`TYPESAFE_API_KEY=...`). Without it, or with `--dry-run`, `replay.py` builds and checks every request, writes the baseline rows and sends nothing.
- `--limit 5` sends five requests first as a paid check. Answers are cached in `data/jev/` by request hash, so reruns, and the full run after the check, only pay for new requests.
- `--arms named` or `--arms anonymised` runs one arm; `--seasons` limits the seasons Jev is asked about; `--model jev-1.13.0` pins a version instead of `jev-latest`.
- Cost: 604 matches × 2 arms = 1,208 requests of about 4,500 characters (roughly 1,300 tokens) each, so about 1.6 million input tokens, about $0.07 at $0.042 per million. Output is free.
- Open-Meteo refuses requests once a shared address has used its daily quota; `collect.py` then stops the weather stage and resumes on the next run.
