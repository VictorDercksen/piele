"""Downloads past URC seasons, line-ups and kickoff forecasts into backtest/data, once.

    uv --directory apps/api run python ../../backtest/collect.py [--seasons 202101 ...]
        [--only seasons,lineups,weather] [--delay 1.0]

Each file keeps the query and the retrieval time next to the response. Existing files are
skipped, so an interrupted run resumes where it stopped.

- data/seasons/<season>.json: every match of the season with score, kickoff, venue, round
  and try events (for bonus points), from one `matchstats(season_id)` query.
- data/lineups/<match>.json: the match's line-ups and player birth dates, fetched with the
  API's own teamsheet provider.
- data/weather/<season>/<venue>.json: hourly Open-Meteo Historical Forecast data for the
  venue over the season's match dates. One request per venue and season.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import common  # noqa: F401 - puts apps/api on the import path

import httpx

from app.matchcentre.catalogue import stadium
from app.matchcentre.providers import teamsheets, weather
from archive import venue_slug

SEASON_QUERY = """
query Season($seasons: [Int]) {
  matchstats(season_id: $seasons) {
    match_id
    season_id
    match_status
    match_datetime
    venue
    home_team_id
    away_team_id
    home_team_name
    away_team_name
    home_score
    away_score
    stats_data {
      round
      roundTypeId
      finalised
      dateTime
      events { type { name } team { id } }
    }
  }
}
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(record, indent=1, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def season_path(season: str) -> Path:
    return common.DATA / "seasons" / f"{season}.json"


def collect_season(client: httpx.Client, season: str) -> None:
    path = season_path(season)
    if path.exists():
        return
    variables = {"seasons": [int(season)]}
    response = client.post(common.URC_GRAPHQL_URL, json={"query": SEASON_QUERY, "variables": variables})
    response.raise_for_status()
    body = response.json()
    if body.get("errors"):
        raise RuntimeError(f"season {season}: {body['errors'][:2]}")
    matches = body["data"]["matchstats"]
    write(path, {"source": common.URC_GRAPHQL_URL, "query": SEASON_QUERY, "variables": variables,
                 "retrievedAt": now_iso(), "matches": matches})
    print(f"season {season}: {len(matches)} matches", flush=True)


def season_matches(season: str) -> list[dict[str, Any]]:
    return json.loads(season_path(season).read_text(encoding="utf-8"))["matches"]


def collect_lineups(client: httpx.Client, season: str, delay: float) -> None:
    matches = season_matches(season)
    fetched = 0
    for match in matches:
        match_id = str(match["match_id"])
        path = common.DATA / "lineups" / f"{match_id}.json"
        if path.exists():
            continue
        for attempt in range(4):
            try:
                result = teamsheets.fetch_teamsheets(client, common.URC_GRAPHQL_URL, match_id)
                break
            except httpx.HTTPError as error:
                print(f"  lineup {match_id}: {type(error).__name__}, retrying", flush=True)
                time.sleep(2 ** (attempt + 1))
        else:
            print(f"  lineup {match_id}: gave up", flush=True)
            continue
        write(path, {"source": common.URC_GRAPHQL_URL, "provider": "app.matchcentre.providers.teamsheets",
                     "matchId": match_id, "retrievedAt": now_iso(), "status": result.status,
                     "payload": result.payload})
        fetched += 1
        time.sleep(delay)
    print(f"lineups {season}: {fetched} fetched, {len(matches)} in season", flush=True)


def collect_weather(client: httpx.Client, season: str, delay: float) -> None:
    by_venue: dict[str, list[datetime]] = {}
    for match in season_matches(season):
        kickoff = kickoff_utc(match)
        by_venue.setdefault(match["venue"], []).append(kickoff)
    for venue, kickoffs in sorted(by_venue.items()):
        place = stadium(venue)
        if place is None:
            print(f"  weather {season}: venue not in the catalogue: {venue}", flush=True)
            continue
        path = common.DATA / "weather" / season / f"{venue_slug(venue)}.json"
        if path.exists():
            continue
        params = {
            "latitude": place.latitude,
            "longitude": place.longitude,
            "hourly": ",".join(weather.HOURLY),
            "timezone": "UTC",
            "start_date": min(kickoffs).date().isoformat(),
            "end_date": (max(kickoffs) + weather.MATCH_LENGTH).date().isoformat(),
            "wind_speed_unit": "kmh",
        }
        response = client.get(common.HISTORICAL_FORECAST_URL, params=params)
        if response.status_code != 200:
            reason = response.text[:200]
            print(f"  weather {season} {venue}: HTTP {response.status_code} {reason}", flush=True)
            if "limit exceeded" in reason.lower():
                print("  Open-Meteo request limit reached; run again later to resume.", flush=True)
                return
            continue
        write(path, {"source": common.HISTORICAL_FORECAST_URL, "params": params, "venue": venue,
                     "retrievedAt": now_iso(), "hourly": response.json().get("hourly") or {}})
        time.sleep(delay)
    print(f"weather {season}: done", flush=True)


def kickoff_utc(match: dict[str, Any]) -> datetime:
    """`match_datetime` is UTC in the feed (it equals stats_data.dateTime)."""
    return datetime.fromisoformat(match["match_datetime"]).replace(tzinfo=timezone.utc)


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seasons", nargs="+", default=list(common.SEASONS))
    parser.add_argument("--only", default="seasons,lineups,weather")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    args = parser.parse_args(argv)
    stages = set(args.only.split(","))
    timeout = httpx.Timeout(60.0)
    with httpx.Client(timeout=timeout, headers={"User-Agent": common.USER_AGENT}) as client:
        for season in args.seasons:
            if "seasons" in stages:
                collect_season(client, season)
            if "lineups" in stages:
                collect_lineups(client, season, args.delay)
            if "weather" in stages:
                collect_weather(client, season, args.delay)


if __name__ == "__main__":
    main(sys.argv[1:])
