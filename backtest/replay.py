"""Replays past URC seasons: each match's pre-kickoff state, Jev and the baselines.

    uv --directory apps/api run python ../../backtest/replay.py --run <name>
        [--arms named,anonymised] [--seasons 202201 ...] [--model jev-latest]
        [--limit N] [--workers 4] [--dry-run]

For every match, in kickoff order: the API's build_state over the downloaded season
(guarded against anything from kickoff onward), the API's Jev request for each arm, and
the three baselines. Picks come from app.agent.pick. Writes results/<name>/rows.csv (one
row per match and model) and settings.json; score.py summarises them.

Jev answers are cached in data/jev/<request hash>.json, so reruns cost nothing and give
the same rows. Without TYPESAFE_API_KEY (environment or backtest/.env), or with
--dry-run, requests are built and checked but not sent, and only baseline rows are
written. --limit sends at most N new requests, for a first paid check.
"""

import argparse
import csv
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any

import common

import httpx

from app.agent import jev
from app.agent.pick import pick
from app.agent.scoring import SUPERBRU
from app.agent.state import build_state

import baselines
from anonymise import Pseudonyms
from archive import ArchiveSource, Match, load_season

# The state is built as at this long before kickoff; only its generatedAt depends on it.
LEAD = timedelta(hours=1)
ARMS = ("named", "anonymised")
CACHE = common.DATA / "jev"
FIELDS = [
    "season", "round", "fixture_id", "kickoff_utc", "home_id", "away_id", "home_score", "away_score",
    "teamsheet_status", "model", *(f"p_{k}" for k in jev.BAND_KEYS), "pick_winner", "pick_margin",
    "request_hash", "model_version",
]


def row(match: Match, state: dict[str, Any], model: str, distribution: dict[str, float],
        request_hash: str = "", model_version: str = "") -> dict[str, Any]:
    chosen = pick(distribution, SUPERBRU)
    f = match.fixture
    return {
        "season": match.season, "round": f.round, "fixture_id": f.id, "kickoff_utc": match.kickoff.isoformat(),
        "home_id": f.home_id, "away_id": f.away_id, "home_score": match.home_score, "away_score": match.away_score,
        "teamsheet_status": state.get("teamsheetStatus"), "model": model,
        **{f"p_{k}": round(distribution[k], 6) for k in jev.BAND_KEYS},
        "pick_winner": chosen.winner, "pick_margin": chosen.margin,
        "request_hash": request_hash, "model_version": model_version,
    }


def cached(request_hash: str) -> dict[str, Any] | None:
    path = CACHE / f"{request_hash}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def call(client: httpx.Client, key: str, request_hash: str, request: dict[str, Any]) -> dict[str, Any]:
    response = jev.ask(client, request, key)
    jev.distribution(response)  # refuse to cache an unusable answer
    record = {"requestHash": request_hash, "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "request": request, "response": response}
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / f"{request_hash}.tmp"
    tmp.write_text(json.dumps(record, sort_keys=True), encoding="utf-8")
    tmp.replace(CACHE / f"{request_hash}.json")
    return record


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=common.ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True, help="results folder name, e.g. 2026-09-25")
    parser.add_argument("--arms", default=",".join(ARMS))
    parser.add_argument("--seasons", nargs="+", default=list(common.REPORTED_SEASONS), help="seasons Jev is asked about")
    parser.add_argument("--model", default=jev.MODEL)
    parser.add_argument("--limit", type=int, default=None, help="send at most this many new Jev requests")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    arms = [a for a in args.arms.split(",") if a]
    assert set(arms) <= set(ARMS), f"arms are {ARMS}"
    common.load_env()
    key = os.environ.get("TYPESAFE_API_KEY", "")
    send = bool(key) and not args.dry_run

    seasons = list(common.SEASONS)
    matches = {s: load_season(s) for s in seasons}
    sources = {s: ArchiveSource(s, matches[s]) for s in seasons}
    states: dict[str, dict[str, Any]] = {}
    for season in seasons:
        for match in matches[season]:
            states[match.fixture.id] = build_state(match.fixture, sources[season], match.kickoff - LEAD)
    print(f"states: {len(states)} matches", flush=True)

    # Baselines: fitted on the tuning season, then run over every season in order.
    tuning = [(m, states[m.fixture.id]) for m in matches[common.TUNING_SEASON]]
    models = baselines.tune(tuning)
    rows: list[dict[str, Any]] = []
    for season in seasons:
        for match in matches[season]:
            state = states[match.fixture.id]
            predictions = [(b.name, b.predict(match, state)) for b in models]
            for b in models:
                b.update(match)
            rows += [row(match, state, name, dist) for name, dist in predictions]

    # Jev: build every request, reuse cached answers, send the rest.
    pending: dict[str, dict[str, Any]] = {}
    wanted: list[tuple[Match, str, str]] = []
    skipped_no_teamsheet = 0
    leaks: list[str] = []
    for season in args.seasons:
        pseudonyms = Pseudonyms(season, {c for m in matches[season] for c in (m.fixture.home_id, m.fixture.away_id)},
                                {m.fixture.venue or "" for m in matches[season]}, sources[season].player_names())
        for match in matches[season]:
            state = states[match.fixture.id]
            if state["teamsheetStatus"] != "ok":
                skipped_no_teamsheet += 1
                continue
            for arm in arms:
                request = jev.build_request(pseudonyms.state(state) if arm == "anonymised" else state, args.model)
                if arm == "anonymised":
                    leaks += [f"{match.fixture.id}: {name}" for name in pseudonyms.leaks(request)]
                request_hash = jev.request_hash(request)
                wanted.append((match, arm, request_hash))
                if cached(request_hash) is None:
                    pending[request_hash] = request
    if leaks:
        raise SystemExit("anonymised requests still name real clubs, players or places: " + "; ".join(leaks[:10]))

    to_send = list(pending.items())[: args.limit] if args.limit is not None else list(pending.items())
    failed: list[str] = []
    if send and to_send:
        print(f"jev: sending {len(to_send)} requests ({len(pending)} not cached)", flush=True)
        with httpx.Client(timeout=httpx.Timeout(60.0), headers={"User-Agent": common.USER_AGENT}) as client:
            first_hash, first_request = to_send[0]
            try:
                call(client, key, first_hash, first_request)  # a bad key or request stops here
            except (httpx.HTTPError, ValueError) as error:
                detail = error.response.text[:300] if isinstance(error, httpx.HTTPStatusError) else str(error)[:300]
                raise SystemExit(f"the first Jev request failed: {type(error).__name__}: {detail}")
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = {pool.submit(call, client, key, h, r): h for h, r in to_send[1:]}
                for done, future in enumerate(as_completed(futures), start=1):
                    try:
                        future.result()
                    except (httpx.HTTPError, ValueError) as error:
                        failed.append(f"{futures[future]}: {type(error).__name__}: {str(error)[:200]}")
                    if done % 50 == 0:
                        print(f"  {done}/{len(to_send)}", flush=True)

    reported: set[str] = set()
    input_tokens = 0
    answered = 0
    for match, arm, request_hash in wanted:
        record = cached(request_hash)
        if record is None:
            continue
        response = record["response"]
        reported.add(response.get("model", ""))
        input_tokens += (response.get("usage") or {}).get("input_tokens", 0)
        answered += 1
        rows.append(row(match, states[match.fixture.id], f"jev_{arm}", jev.distribution(response),
                        request_hash, response.get("model", "")))

    folder = common.RESULTS / args.run
    folder.mkdir(parents=True, exist_ok=True)
    rows.sort(key=lambda r: (r["kickoff_utc"], r["fixture_id"], r["model"]))
    with (folder / "rows.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    characters = sum(len(json.dumps(r)) for r in pending.values())
    settings = {
        "run": args.run,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "commit": git("rev-parse", "HEAD"),
        "dirty": bool(git("status", "--porcelain", "--untracked-files=no")),
        "seasons": {"tuning": common.TUNING_SEASON, "reported": list(common.REPORTED_SEASONS), "jev": args.seasons},
        "arms": arms,
        "leadHours": LEAD.total_seconds() / 3600,
        "scoringVersion": SUPERBRU.version,
        "baselines": {b.name: b.params() for b in models},
        "jev": {
            "url": jev.URL,
            "modelRequested": args.model,
            "modelsReported": sorted(m for m in reported if m),
            "questionHash": jev.question_hash(),
            "requests": len(wanted),
            "answered": answered,
            "notCached": len(pending),
            "sent": len(to_send) if send else 0,
            "failed": failed,
            "skippedWithoutTeamsheets": skipped_no_teamsheet,
            "inputTokensReported": input_tokens,
            "uncachedRequestCharacters": characters,
            "mode": "sent" if send else "dry run" if args.dry_run else "no TYPESAFE_API_KEY",
        },
        "data": {s: json.loads((common.DATA / "seasons" / f"{s}.json").read_text(encoding="utf-8"))["retrievedAt"] for s in seasons},
    }
    (folder / "settings.json").write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(settings["jev"], indent=2))
    print(f"wrote {folder / 'rows.csv'} ({len(rows)} rows)")
    if failed:
        print(f"{len(failed)} Jev requests failed; rerun to retry them.", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
