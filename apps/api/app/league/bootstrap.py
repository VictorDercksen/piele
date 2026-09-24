"""Operator bootstrap: creates the league, its captain and the first season in one
transaction (plan section 6, "Joining"). Not an HTTP endpoint.

    uv run python -m app.league.bootstrap --captain-email captain@example.com

Runs against DATABASE_URL as the runtime role and refuses to run twice. Members come from
app/data/league_members.json; the captain's verified email is the only argument, so their
first sign-in claims the captain membership. Other members' emails are set from the
captain's desk afterwards.
"""

import argparse
import json
import sys
from pathlib import Path
from uuid import uuid4

from sqlalchemy import insert, select, text
from sqlalchemy.engine import Connection

from app.config import get_settings
from app.db import get_engine
from app.league import tables as t

MEMBERS_FILE = Path(__file__).resolve().parent.parent / "data" / "league_members.json"


def bootstrap(connection: Connection, captain_email: str, seed: dict) -> str:
    league_id = uuid4()
    # Leagues are visible only inside their own context, so set it before inserting.
    connection.execute(text("select set_config('piele.league_id', :id, true)"), {"id": str(league_id)})
    existing = connection.execute(
        text("select count(*) from piele.league_memberships where lower(invited_email) = lower(:email)"),
        {"email": captain_email},
    ).scalar_one()
    if existing:
        raise SystemExit("A membership with the captain's email already exists; refusing to bootstrap twice.")

    captain_name = seed["captain"]
    memberships = {}
    for member in seed["members"]:
        memberships[member["displayName"]] = uuid4()
    captain_id = memberships[captain_name]
    connection.execute(
        insert(t.leagues).values(id=league_id, name=seed["league"], captain_membership_id=captain_id)
    )
    for member in seed["members"]:
        is_captain = member["displayName"] == captain_name
        connection.execute(
            insert(t.league_memberships).values(
                id=memberships[member["displayName"]],
                league_id=league_id,
                display_name=member["displayName"],
                full_name=member["fullName"],
                invited_email=captain_email.lower() if is_captain else None,
            )
        )
    season_id = connection.execute(
        insert(t.seasons)
        .values(
            league_id=league_id,
            name=seed["season"]["name"],
            competition=seed["season"]["competition"],
            status="active",
        )
        .returning(t.seasons.c.id)
    ).scalar_one()
    for membership_id in memberships.values():
        connection.execute(
            insert(t.season_memberships).values(league_id=league_id, season_id=season_id, membership_id=membership_id)
        )
    connection.execute(
        insert(t.audit_events).values(
            league_id=league_id,
            actor_label="operator bootstrap",
            action="league.bootstrapped",
            entity_type="league",
            entity_id=league_id,
            after={"members": len(memberships), "season": seed["season"]["name"]},
        )
    )
    connection.execute(
        insert(t.feed_entries).values(
            league_id=league_id,
            season_id=season_id,
            kind="season_opened",
            title=f"{seed['season']['name']} is open.",
            detail=f"{len(memberships)} members enrolled. {captain_name} is captain.",
        )
    )
    return str(league_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--captain-email", required=True)
    parser.add_argument("--members-file", type=Path, default=MEMBERS_FILE)
    args = parser.parse_args(argv)
    engine = get_engine(get_settings())
    if engine is None:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 2
    seed = json.loads(args.members_file.read_text(encoding="utf-8"))
    with engine.begin() as connection:
        league_id = bootstrap(connection, args.captain_email, seed)
    print(f"Bootstrapped league {league_id} with {len(seed['members'])} members.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
