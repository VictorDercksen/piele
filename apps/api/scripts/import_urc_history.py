"""Writes app/competitions/urc_2026_27/history.json: the results of seasons 2021/22 to 2025/26.

Run from apps/api when the file needs refreshing (the past does not change, so normally once):

    uv run python scripts/import_urc_history.py            # writes the file
    uv run python scripts/import_urc_history.py --dry-run  # counts only

Each season is one `matchstats(season_id: [...])` query on the URC GraphQL feed (the same
query and parser as app/matchcentre/providers/results.py). Feed team ids are mapped to
catalogue club ids through `Club.source_id`; a row with a team the catalogue does not hold
(Cheetahs, Southern Kings and so on) is dropped and listed in the output. The file also
keeps every name the feed used for each club, including the current season's, so the chat
can recognise former sponsor names ("Emirates Lions").

Cloudflare answers 403 to some HTTP clients; the app's own User-Agent is sent. If it still
fails behind a proxy that intercepts TLS, add `--direct` (ignores proxy settings) and make
sure SSL_CERT_FILE names the CA bundle that proxy uses. TLS verification is never disabled.
"""

import argparse
import json
import os
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.competitions.urc_2026_27 import COMPETITION  # noqa: E402
from app.config import Settings  # noqa: E402
from app.matchcentre.providers import results  # noqa: E402
from app.matchcentre.service import USER_AGENT  # noqa: E402

FIRST_YEAR, LAST_YEAR = 2021, 2025
OUTPUT = Path(__file__).resolve().parents[1] / "app" / "competitions" / "urc_2026_27" / "history.json"


def season_id(year: int) -> str:
    return f"{year}01"


def season_label(year: int) -> str:
    return f"{year}/{(year + 1) % 100:02d}"


def client(direct: bool) -> httpx.Client:
    bundle = os.environ.get("SSL_CERT_FILE")
    verify: Any = ssl.create_default_context(cafile=bundle) if bundle else True
    return httpx.Client(
        timeout=httpx.Timeout(30.0),
        headers={"User-Agent": USER_AGENT},
        trust_env=not direct,
        verify=verify,
    )


def note_names(names: dict[str, list[str]], row: dict[str, Any]) -> None:
    for side in ("home", "away"):
        club = COMPETITION.club_by_source_id(row.get(f"{side}_team_id"))
        name = " ".join(str(row.get(f"{side}_team_name") or "").split())
        if club is not None and name and name not in names.setdefault(club.id, []):
            names[club.id].append(name)


def build_season(year: int, rows: list[dict[str, Any]], names: dict[str, list[str]]) -> tuple[dict[str, Any], list[str]]:
    """The season's results with catalogue ids, and a line per dropped row."""
    kept, dropped = [], []
    for row in rows:
        note_names(names, row)
        result = results.parse_row(row)
        if result is None:
            continue
        home = COMPETITION.club_by_source_id(result["homeSourceId"])
        away = COMPETITION.club_by_source_id(result["awaySourceId"])
        if home is None or away is None:
            dropped.append(f"{row.get('home_team_name')} {result['homeScore']}-{result['awayScore']} {row.get('away_team_name')} ({result['kickoffUtc'][:10]})")
            continue
        kept.append(
            {
                "matchId": result["fixtureId"],
                "homeId": home.id,
                "awayId": away.id,
                "homeScore": result["homeScore"],
                "awayScore": result["awayScore"],
                "kickoffUtc": result["kickoffUtc"],
                "venue": result["venue"],
            }
        )
    kept.sort(key=lambda r: (r["kickoffUtc"], r["matchId"]))
    return {"seasonId": season_id(year), "label": season_label(year), "results": kept}, dropped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print counts without writing the file")
    parser.add_argument("--direct", action="store_true", help="ignore proxy environment variables")
    parser.add_argument("--url", default=Settings(_env_file=None).urc_graphql_url)
    args = parser.parse_args()

    names: dict[str, list[str]] = {}
    seasons = []
    with client(args.direct) as http:
        for year in range(FIRST_YEAR, LAST_YEAR + 1):
            rows = results.fetch_rows(http, args.url, season_id(year))
            season, dropped = build_season(year, rows, names)
            seasons.append(season)
            print(f"{season['label']} ({season['seasonId']}): {len(rows)} rows, {len(season['results'])} kept, {len(dropped)} dropped")
            for line in dropped:
                print(f"  dropped: {line}")
        # The current season only contributes the names the feed uses now.
        for row in results.fetch_rows(http, args.url, COMPETITION.feed_season_id):
            note_names(names, row)

    document = {
        "source": args.url,
        "retrievedAt": datetime.now(timezone.utc).date().isoformat(),
        "seasons": seasons,
        "clubNames": {club.id: names.get(club.id, []) for club in COMPETITION.clubs},
    }
    if args.dry_run:
        return 0
    OUTPUT.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
