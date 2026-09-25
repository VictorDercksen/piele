"""Superbru points and probability metrics from a replay's rows.

    uv --directory apps/api run python ../../backtest/score.py --run <name>

Reads results/<name>/rows.csv and settings.json, writes summary.md and rounds.csv next to
them. Only fixtures every model has a row for are compared, and only the reported
seasons (2021/22 tunes the baselines). Picks come from app.agent.pick in the replay;
points from app.agent.scoring here. Confidence intervals resample whole rounds.
"""

import argparse
import csv
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping

import common

from app.agent.jev import BAND_KEYS, band_for
from app.agent.pick import outcome_probabilities
from app.agent.scoring import SUPERBRU, Pick, fixture_points, grand_slam, outcome

LOG_FLOOR = 1e-3
RESAMPLES = 2000
SEED = 20260925
REFERENCE = "elo"
DECISION_MODEL = "jev_anonymised"
CALIBRATION_BUCKETS = 10


# Metrics ------------------------------------------------------------------------------


def rps(distribution: Mapping[str, float], actual: str) -> float:
    """Ranked probability score over the ordered bands, 0 (best) to 1."""
    total, predicted, observed = 0.0, 0.0, 0.0
    for key in BAND_KEYS[:-1]:
        predicted += distribution[key]
        observed += 1.0 if key == actual else 0.0
        total += (predicted - observed) ** 2
    return total / (len(BAND_KEYS) - 1)


def log_loss(distribution: Mapping[str, float], result: str) -> float:
    """Natural-log loss on home, draw or away, with probabilities floored at LOG_FLOOR."""
    return -math.log(max(outcome_probabilities(distribution)[result], LOG_FLOOR))  # type: ignore[index]


def brier(distribution: Mapping[str, float], result: str) -> float:
    """Multi-class Brier score on home, draw or away, 0 (best) to 2."""
    probabilities = outcome_probabilities(distribution)
    return sum((p - (1.0 if side == result else 0.0)) ** 2 for side, p in probabilities.items())


# Rows ---------------------------------------------------------------------------------


def load_rows(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        row["round"] = int(row["round"])
        row["home_score"], row["away_score"] = int(row["home_score"]), int(row["away_score"])
        row["pick_margin"] = int(row["pick_margin"])
        row["distribution"] = {key: float(row[f"p_{key}"]) for key in BAND_KEYS}
    return rows


def scored(row: dict[str, Any]) -> dict[str, Any]:
    home, away = row["home_score"], row["away_score"]
    points = fixture_points(Pick(row["pick_winner"], row["pick_margin"]), home, away, SUPERBRU)
    result = outcome(home, away)
    return {
        **row,
        "correct": points.correct_outcome,
        "win_points": points.win,
        "margin_points": points.margin,
        "points": points.total,
        "log_loss": log_loss(row["distribution"], result),
        "brier": brier(row["distribution"], result),
        "rps": rps(row["distribution"], band_for(home, away)),
        "result": result,
    }


def comparable(rows: Iterable[dict[str, Any]], seasons: Iterable[str]) -> tuple[list[dict[str, Any]], list[str], int]:
    """Rows of the given seasons for fixtures every model predicted, the models, and how
    many fixtures were dropped because a model had no row."""
    wanted = set(seasons)
    rows = [r for r in rows if r["season"] in wanted]
    models = sorted({r["model"] for r in rows})
    by_fixture: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        by_fixture[row["fixture_id"]].add(row["model"])
    complete = {f for f, found in by_fixture.items() if found == set(models)}
    return [r for r in rows if r["fixture_id"] in complete], models, len(by_fixture) - len(complete)


# Summaries ----------------------------------------------------------------------------


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else float("nan")


def summarise(rows: list[dict[str, Any]], model: str) -> dict[str, Any]:
    mine = [r for r in rows if r["model"] == model]
    rounds: dict[tuple[str, int], list[bool]] = defaultdict(list)
    for r in mine:
        rounds[(r["season"], r["round"])].append(r["correct"])
    return {
        "matches": len(mine),
        "points": sum(r["points"] for r in mine),
        "pointsPerMatch": mean([r["points"] for r in mine]),
        "correctOutcome": mean([1.0 if r["correct"] else 0.0 for r in mine]),
        "marginPoint": mean([1.0 if r["margin_points"] else 0.0 for r in mine]),
        "grandSlams": sum(1 for outcomes in rounds.values() if grand_slam(outcomes, SUPERBRU)),
        "logLoss": mean([r["log_loss"] for r in mine]),
        "brier": mean([r["brier"] for r in mine]),
        "rps": mean([r["rps"] for r in mine]),
    }


def bootstrap(rows: list[dict[str, Any]], models: list[str]) -> dict[str, dict[str, tuple[float, float]]]:
    """95% intervals for points per match and RPS, and for each model's difference from the
    reference model, resampling whole rounds."""
    clusters: dict[tuple[str, int], dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"points": 0.0, "rps": 0.0, "n": 0.0})
    )
    for r in rows:
        cell = clusters[(r["season"], r["round"])][r["model"]]
        cell["points"] += r["points"]
        cell["rps"] += r["rps"]
        cell["n"] += 1
    keys = sorted(clusters)
    rng = random.Random(SEED)
    draws: dict[str, dict[str, list[float]]] = {m: defaultdict(list) for m in models}
    for _ in range(RESAMPLES):
        sample = [clusters[rng.choice(keys)] for _ in keys]
        totals = {m: {k: sum(c[m][k] for c in sample) for k in ("points", "rps", "n")} for m in models}
        for m in models:
            n = totals[m]["n"] or 1.0
            draws[m]["points"].append(totals[m]["points"] / n)
            draws[m]["rps"].append(totals[m]["rps"] / n)
            if REFERENCE in totals and m != REFERENCE:
                ref = totals[REFERENCE]
                draws[m]["pointsVsReference"].append((totals[m]["points"] - ref["points"]) / n)
                draws[m]["rpsVsReference"].append((totals[m]["rps"] - ref["rps"]) / n)
    return {m: {k: percentile_interval(v) for k, v in d.items()} for m, d in draws.items()}


def percentile_interval(values: list[float]) -> tuple[float, float]:
    ordered = sorted(values)
    return ordered[int(0.025 * (len(ordered) - 1))], ordered[int(0.975 * (len(ordered) - 1))]


def calibration(rows: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    """Home, draw and away probabilities pooled into ten buckets: forecast against outcome."""
    buckets: list[list[tuple[float, float]]] = [[] for _ in range(CALIBRATION_BUCKETS)]
    for r in rows:
        if r["model"] != model:
            continue
        for side, p in outcome_probabilities(r["distribution"]).items():
            index = min(int(p * CALIBRATION_BUCKETS), CALIBRATION_BUCKETS - 1)
            buckets[index].append((p, 1.0 if side == r["result"] else 0.0))
    return [
        {"bucket": f"{i / CALIBRATION_BUCKETS:.1f}-{(i + 1) / CALIBRATION_BUCKETS:.1f}", "count": len(b),
         "forecast": mean([p for p, _ in b]), "observed": mean([o for _, o in b])}
        for i, b in enumerate(buckets)
        if b
    ]


def round_points(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[tuple[str, int, str], float] = defaultdict(float)
    for r in rows:
        totals[(r["season"], r["round"], r["model"])] += r["points"]
    return [{"season": s, "round": n, "model": m, "points": p} for (s, n, m), p in sorted(totals.items())]


# Report -------------------------------------------------------------------------------


def decision(stats: dict[str, dict[str, Any]], intervals: dict[str, Any]) -> str:
    if DECISION_MODEL not in stats or REFERENCE not in stats:
        return f"Not evaluated: this run has no `{DECISION_MODEL}` rows."
    mine, ref = stats[DECISION_MODEL], stats[REFERENCE]
    better_points = mine["pointsPerMatch"] > ref["pointsPerMatch"]
    better_rps = mine["rps"] < ref["rps"]
    points_ci = intervals[DECISION_MODEL].get("pointsVsReference")
    rps_ci = intervals[DECISION_MODEL].get("rpsVsReference")
    verdict = "met" if better_points and better_rps else "not met"
    return (
        f"**{verdict}.** `{DECISION_MODEL}` against `{REFERENCE}`: points per match "
        f"{mine['pointsPerMatch'] - ref['pointsPerMatch']:+.3f} (95% interval {points_ci[0]:+.3f} to {points_ci[1]:+.3f}), "
        f"RPS {mine['rps'] - ref['rps']:+.4f} (95% interval {rps_ci[0]:+.4f} to {rps_ci[1]:+.4f}; lower is better)."
    )


def report(run: str, settings: dict[str, Any], rows: list[dict[str, Any]], models: list[str], dropped: int) -> str:
    stats = {m: summarise(rows, m) for m in models}
    intervals = bootstrap(rows, models)
    seasons = sorted({r["season"] for r in rows})
    jev = settings.get("jev", {})
    lines = [
        f"# Jev backtest: {run}",
        "",
        f"Commit `{settings.get('commit')}`{' (uncommitted changes)' if settings.get('dirty') else ''}. "
        f"Jev model requested `{jev.get('modelRequested')}`, reported {', '.join(jev.get('modelsReported') or []) or 'none (not run)'}; "
        f"question hash `{str(jev.get('questionHash'))[:12]}`. Scoring `{SUPERBRU.version}` (win {SUPERBRU.win_points}, "
        f"margin {SUPERBRU.margin_points} within {SUPERBRU.margin_window}; bonus and grand slam points excluded).",
        "",
        f"Seasons {', '.join(common.SEASONS.get(s, s) for s in seasons)}: {len(rows) // max(len(models), 1)} fixtures compared, "
        f"{dropped} left out because a model had no row.",
        "",
        "Leakage: line-ups are the final match-day sheets, forecasts come from Open-Meteo's historical forecast "
        "(short-lead model runs, more accurate than a two-day-ahead forecast), and Jev may have seen these "
        "results in training. The anonymised arm tests recall; the clean test is 2026/27 scored as it happens.",
        "",
        "## All reported seasons",
        "",
        "| Model | Matches | Points | Points per match (95%) | Outcome right | Margin point | Grand slams | Log loss | Brier | RPS (95%) |",
        "| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for m in models:
        s, ci = stats[m], intervals[m]
        lines.append(
            f"| {m} | {s['matches']} | {s['points']:.1f} | {s['pointsPerMatch']:.3f} ({ci['points'][0]:.3f}-{ci['points'][1]:.3f}) "
            f"| {s['correctOutcome']:.1%} | {s['marginPoint']:.1%} | {s['grandSlams']} | {s['logLoss']:.4f} | {s['brier']:.4f} "
            f"| {s['rps']:.4f} ({ci['rps'][0]:.4f}-{ci['rps'][1]:.4f}) |"
        )
    lines += ["", f"## Against `{REFERENCE}`", "", "| Model | Points per match | 95% interval | RPS | 95% interval |",
              "| --- | ---: | --- | ---: | --- |"]
    for m in models:
        if m == REFERENCE or REFERENCE not in stats:
            continue
        ci = intervals[m]
        lines.append(
            f"| {m} | {stats[m]['pointsPerMatch'] - stats[REFERENCE]['pointsPerMatch']:+.3f} "
            f"| {ci['pointsVsReference'][0]:+.3f} to {ci['pointsVsReference'][1]:+.3f} "
            f"| {stats[m]['rps'] - stats[REFERENCE]['rps']:+.4f} | {ci['rpsVsReference'][0]:+.4f} to {ci['rpsVsReference'][1]:+.4f} |"
        )
    lines += ["", "## Decision rule", "", "See [../decision-rule.md](../decision-rule.md). " + decision(stats, intervals)]
    lines += ["", "## Points per season", "", "| Model | " + " | ".join(common.SEASONS.get(s, s) for s in seasons) + " |",
              "| --- |" + " ---: |" * len(seasons)]
    for m in models:
        cells = [sum(r["points"] for r in rows if r["model"] == m and r["season"] == s) for s in seasons]
        lines.append(f"| {m} | " + " | ".join(f"{c:.1f}" for c in cells) + " |")
    lines += ["", "Points per round are in rounds.csv.", "", "## Calibration", "",
              "Home, draw and away probabilities pooled, bucketed by forecast.", ""]
    for m in models:
        lines += [f"### {m}", "", "| Forecast | Count | Mean forecast | Observed |", "| --- | ---: | ---: | ---: |"]
        lines += [f"| {c['bucket']} | {c['count']} | {c['forecast']:.3f} | {c['observed']:.3f} |" for c in calibration(rows, m)]
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True)
    args = parser.parse_args(argv)
    folder = common.RESULTS / args.run
    settings = json.loads((folder / "settings.json").read_text(encoding="utf-8"))
    rows, models, dropped = comparable(load_rows(folder / "rows.csv"), common.REPORTED_SEASONS)
    rows = [scored(r) for r in rows]
    (folder / "summary.md").write_text(report(args.run, settings, rows, models, dropped), encoding="utf-8")
    with (folder / "rounds.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["season", "round", "model", "points"])
        writer.writeheader()
        writer.writerows(round_points(rows))
    print(f"wrote {folder / 'summary.md'}")


if __name__ == "__main__":
    main(sys.argv[1:])
