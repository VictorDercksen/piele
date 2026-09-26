"""Operator bootstrap: creates a league, its captain and the first season in one
transaction (plan section 6, "Joining"). Not an HTTP endpoint.

    uv run python -m app.league.bootstrap --captain-email captain@example.com
    uv run python -m app.league.bootstrap --captain-email c@example.com \\
        --members-file other.json --slug pofadder-bowl --name "Pofadder Bowl"

Runs against DATABASE_URL as the runtime role and refuses to run when a league with the
slug already exists. Members come from app/data/league_members.json (or --members-file);
its `league`, `slug` and `competitionId` are the defaults for --name, --slug and
--competition (URC 2026/27 when absent). The captain's verified email is the only required
argument, so their first sign-in claims the captain membership. Other members claim their
names with the league's join code, or the captain reserves emails from the captain's desk.
The work is `app.league.service.create_league`, shared with the admin's management centre.
"""

import argparse
import json
import sys
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.engine import Connection

from app import competitions
from app.config import get_settings
from app.db import get_engine
from app.league import service

MEMBERS_FILE = Path(__file__).resolve().parent.parent / "data" / "league_members.json"
ACTOR_LABEL = "operator bootstrap"


def bootstrap(
    connection: Connection,
    captain_email: str,
    seed: dict,
    *,
    slug: str | None = None,
    name: str | None = None,
    competition_id: str | None = None,
    timezone: str | None = None,
) -> str:
    """Creates the seed's league. Refusals (a taken slug, an unknown competition) exit."""
    slug = slug or seed.get("slug")
    if not slug:
        raise SystemExit("The league needs a slug: pass --slug or set `slug` in the members file.")
    competition_id = competition_id or seed.get("competitionId") or competitions.DEFAULT_COMPETITION_ID
    competition = competitions.ALL.get(competition_id)
    try:
        league_id = service.create_league(
            connection,
            name=name or seed["league"],
            slug=slug,
            timezone=timezone or seed.get("timezone") or (competition.timezone if competition else "Africa/Johannesburg"),
            competition_id=competition_id,
            season_name=seed["season"]["name"],
            members=seed["members"],
            captain_display_name=seed["captain"],
            captain_email=captain_email,
            actor_label=ACTOR_LABEL,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        if detail.get("code") == "slug_taken":
            raise SystemExit(f"A league with the slug {slug!r} already exists; refusing to bootstrap twice.") from exc
        raise SystemExit(detail.get("message", "The league could not be created.")) from exc
    return str(league_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--captain-email", required=True)
    parser.add_argument("--members-file", type=Path, default=MEMBERS_FILE)
    parser.add_argument("--slug", help="URL slug, e.g. piele (default: the members file's slug)")
    parser.add_argument("--name", help="League name (default: the members file's league)")
    parser.add_argument(
        "--competition",
        help=f"Competition id (default: the members file's competitionId, else {competitions.DEFAULT_COMPETITION_ID})",
    )
    parser.add_argument("--timezone", help="IANA time zone (default: the competition's)")
    args = parser.parse_args(argv)
    engine = get_engine(get_settings())
    if engine is None:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 2
    seed = json.loads(args.members_file.read_text(encoding="utf-8"))
    with engine.begin() as connection:
        league_id = bootstrap(
            connection,
            args.captain_email,
            seed,
            slug=args.slug,
            name=args.name,
            competition_id=args.competition,
            timezone=args.timezone,
        )
    print(f"Bootstrapped league {league_id} with {len(seed['members'])} members.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
