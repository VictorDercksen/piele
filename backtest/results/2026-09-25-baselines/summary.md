# Jev backtest: 2026-09-25-baselines

Commit `459bf62690f226a756fc2012928a60f3d6643b6e`. Jev model requested `jev-latest`, reported none (not run); question hash `a1ba2eb41fba`. Scoring `superbru-super-rugby-2026-09-unconfirmed-for-urc` (win 1.0, margin 0.5 within 5; bonus and grand slam points excluded).

Seasons 2022/23, 2023/24, 2024/25, 2025/26: 604 fixtures compared, 0 left out because a model had no row.

Leakage: line-ups are the final match-day sheets, forecasts come from Open-Meteo's historical forecast (short-lead model runs, more accurate than a two-day-ahead forecast), and Jev may have seen these results in training. The anonymised arm tests recall; the clean test is 2026/27 scored as it happens.

## All reported seasons

| Model | Matches | Points | Points per match (95%) | Outcome right | Margin point | Grand slams | Log loss | Brier | RPS (95%) |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| elo | 604 | 495.0 | 0.820 (0.776-0.862) | 69.9% | 24.2% | 7 | 0.6713 | 0.4073 | 0.1430 (0.1346-0.1512) |
| home_by_7 | 604 | 470.5 | 0.779 (0.727-0.829) | 64.2% | 27.3% | 2 | 0.7529 | 0.4785 | 0.1518 (0.1450-0.1587) |
| table_position | 604 | 451.5 | 0.748 (0.698-0.798) | 61.4% | 26.7% | 4 | 0.7697 | 0.4947 | 0.1577 (0.1503-0.1651) |

## Against `elo`

| Model | Points per match | 95% interval | RPS | 95% interval |
| --- | ---: | --- | ---: | --- |
| home_by_7 | -0.041 | -0.105 to +0.025 | +0.0088 | -0.0018 to +0.0201 |
| table_position | -0.072 | -0.128 to -0.018 | +0.0146 | +0.0042 to +0.0253 |

## Decision rule

See [../decision-rule.md](../decision-rule.md). Not evaluated: this run has no `jev_anonymised` rows.

## Points per season

| Model | 2022/23 | 2023/24 | 2024/25 | 2025/26 |
| --- | ---: | ---: | ---: | ---: |
| elo | 121.0 | 130.5 | 128.0 | 115.5 |
| home_by_7 | 103.0 | 122.5 | 121.5 | 123.5 |
| table_position | 107.0 | 119.5 | 112.0 | 113.0 |

Points per round are in rounds.csv.

## Calibration

Home, draw and away probabilities pooled, bucketed by forecast.

### elo

| Forecast | Count | Mean forecast | Observed |
| --- | ---: | ---: | ---: |
| 0.0-0.1 | 775 | 0.022 | 0.040 |
| 0.1-0.2 | 137 | 0.150 | 0.248 |
| 0.2-0.3 | 119 | 0.248 | 0.336 |
| 0.3-0.4 | 100 | 0.355 | 0.390 |
| 0.4-0.5 | 86 | 0.451 | 0.488 |
| 0.5-0.6 | 99 | 0.552 | 0.505 |
| 0.6-0.7 | 92 | 0.649 | 0.587 |
| 0.7-0.8 | 117 | 0.752 | 0.658 |
| 0.8-0.9 | 128 | 0.848 | 0.719 |
| 0.9-1.0 | 159 | 0.954 | 0.912 |

### home_by_7

| Forecast | Count | Mean forecast | Observed |
| --- | ---: | ---: | ---: |
| 0.0-0.1 | 604 | 0.019 | 0.028 |
| 0.3-0.4 | 604 | 0.348 | 0.329 |
| 0.6-0.7 | 604 | 0.633 | 0.642 |

### table_position

| Forecast | Count | Mean forecast | Observed |
| --- | ---: | ---: | ---: |
| 0.0-0.1 | 604 | 0.020 | 0.028 |
| 0.3-0.4 | 604 | 0.345 | 0.358 |
| 0.6-0.7 | 604 | 0.635 | 0.614 |
