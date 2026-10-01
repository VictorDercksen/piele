"""PostgreSQL integration tests. They run when PIELE_TEST_DATABASE_URL points at a
database with supabase/migrations applied and connects as the piele_api runtime role
(see .github/workflows/ci.yml). Otherwise they are skipped."""

import os
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings
from app.db import get_engine
from app.main import create_app
from app.matchcentre.cache import PostgresSnapshotCache, Snapshot, now_utc

DATABASE_URL = os.environ.get("PIELE_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, environment="test", database_url=DATABASE_URL)


def test_health_reports_database_and_cache_table(settings: Settings) -> None:
    response = TestClient(create_app(settings)).get("/v1/health")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"
    assert response.json()["snapshotCache"] == "database"


def test_runtime_role_reads_and_writes_snapshots(settings: Settings) -> None:
    cache = PostgresSnapshotCache(get_engine(settings))
    moment = now_utc()
    key = f"test:{moment.timestamp()}"
    cache.put(Snapshot(key, "ok", {"n": 1}, moment, moment + timedelta(hours=1)))
    cache.put(Snapshot(key, "ok", {"n": 2}, moment, moment + timedelta(hours=1)))
    assert cache.get(key).payload == {"n": 2}


def test_the_previous_apis_milestone_upsert_still_works(settings: Settings) -> None:
    """The API deployed before 20260926150000 upserts on (fixture_id, kind); the legacy
    unique index keeps that working until the new API is live."""
    fixture_id = f"legacy-{uuid4().hex}"
    legacy = text(
        "insert into piele.fixture_milestones (fixture_id, kind) values (:f, 'full_time')"
        " on conflict (fixture_id, kind) do nothing"
    )
    with get_engine(settings).begin() as connection:
        connection.execute(legacy, {"f": fixture_id})
        connection.execute(legacy, {"f": fixture_id})
        count = connection.execute(
            text("select count(*) from piele.fixture_milestones where fixture_id = :f"), {"f": fixture_id}
        ).scalar_one()
    assert count == 1


def test_runtime_role_is_restricted(settings: Settings) -> None:
    with get_engine(settings).connect() as connection:
        role = connection.execute(
            text("select rolsuper, rolbypassrls, rolcreaterole from pg_roles where rolname = current_user")
        ).one()
        assert tuple(role) == (False, False, False)
        with pytest.raises(Exception, match="permission denied"):
            connection.execute(text("create table piele.forbidden (id int)"))


# Superbru picks and rules (20260927110000_picks_and_rules.sql, 20261002090000_universal_picks.sql)


def _new_league(connection) -> dict:
    """A bootstrapped league with its context set: its id, season and Mo's memberships. Mo
    is a name nobody has claimed."""
    from tests.test_league import SEED, new_league

    league_id = new_league(connection, f"captain-{uuid4().hex[:8]}@example.com", SEED)
    connection.execute(text("select set_config('piele.league_id', :l, true)"), {"l": league_id})
    row = connection.execute(
        text(
            "select s.id as season_id, sm.id as season_membership_id, m.id as membership_id"
            " from piele.seasons s join piele.season_memberships sm on sm.season_id = s.id"
            " join piele.league_memberships m on m.id = sm.membership_id"
            " where s.league_id = :l and m.display_name = 'Mo'"
        ),
        {"l": league_id},
    ).one()
    return {"league_id": league_id, **row._asdict()}


def _new_account(connection) -> str:
    """A new account, signed in for the rest of the transaction."""
    subject = str(uuid4())
    connection.execute(text("select set_config('piele.auth_subject', :s, true)"), {"s": subject})
    return str(
        connection.execute(
            text("insert into piele.users (auth_subject, email) values (:s, :e) returning id"),
            {"s": subject, "e": f"account-{subject[:8]}@example.com"},
        ).scalar_one()
    )


def _name(league: dict) -> dict:
    """The owner columns of a pick held by Mo's unclaimed name in the league."""
    return {"membership_id": league["membership_id"], "league_id": league["league_id"]}


def _insert_pick(connection, owner: dict, recorded_by: str, fixture_id: str, side: str, margin, **extra) -> None:
    columns = {
        "competition_id": "urc-2026-27",
        "fixture_id": fixture_id,
        "side": side,
        "margin": margin,
        "is_default": False,
        "recorded_by_user_id": recorded_by,
        **owner,
        **extra,
    }
    connection.execute(
        text(f"insert into piele.picks ({', '.join(columns)}) values ({', '.join(':' + key for key in columns)})"), columns
    )


def test_pick_constraints_keep_picks_well_formed(settings: Settings) -> None:
    """A pick has one owner: an account (one pick per competition and fixture) or, until the
    name is claimed, a league's name (one pick per fixture)."""
    with get_engine(settings).connect() as connection:
        with connection.begin():
            league = _new_league(connection)
            account = _new_account(connection)
            name = _name(league)
            _insert_pick(connection, name, account, "292584", "home", 7)
            _insert_pick(connection, name, account, "292585", "draw", 0)
            _insert_pick(connection, name, account, "292586", "missed", None)
            _insert_pick(connection, name, account, "292587", "away", 3, is_default=True)
            _insert_pick(connection, {"user_id": account}, account, "292584", "away", 2)
            _insert_pick(connection, {"user_id": account}, account, "292584", "away", 2, competition_id="test-competition")
            for owner, fixture_id, side, margin, extra in (
                (name, "292588", "draw", 5, {}),
                (name, "292588", "home", 0, {}),
                (name, "292588", "home", 151, {}),
                (name, "292588", "missed", 3, {}),
                (name, "292588", "sideways", 3, {}),
                (name, "292588", "draw", 0, {"is_default": True}),
                (name, "292584", "away", 2, {}),  # one pick per name and fixture
                ({"user_id": account}, "292584", "home", 1, {}),  # one per account, competition and fixture
                ({**name, "user_id": account}, "292588", "home", 1, {}),  # one owner
                ({}, "292588", "home", 1, {}),  # an owner
                ({"membership_id": league["membership_id"]}, "292588", "home", 1, {}),  # a name's pick names its league
            ):
                with pytest.raises(Exception, match="violates"):
                    with connection.begin_nested():
                        _insert_pick(connection, owner, account, fixture_id, side, margin, **extra)
            rules = connection.execute(
                text("select rules, previous_champion_membership_id from piele.seasons where id = :s"), {"s": league["season_id"]}
            ).one()
            assert (rules.rules, rules.previous_champion_membership_id) == ({}, None)


def test_picks_and_champions_stay_in_their_league(settings: Settings) -> None:
    """An unclaimed name's pick belongs to its league. An account's pick is read in every
    league the account belongs to, and in no other."""
    with get_engine(settings).connect() as connection:
        with connection.begin():
            first = _new_league(connection)
            recorder = _new_account(connection)
            _insert_pick(connection, _name(first), recorder, "292584", "home", 7)
            second = _new_league(connection)
            name_picks = lambda league: connection.execute(  # noqa: E731
                text("select count(*) from piele.picks where membership_id = :m"), {"m": league["membership_id"]}
            ).scalar_one()
            # The first league's name and its pick are invisible in the second league's
            # context and cannot be written there.
            assert name_picks(first) == 0
            with pytest.raises(Exception, match="row-level security"):
                with connection.begin_nested():
                    _insert_pick(connection, _name(first), recorder, "292585", "home", 7)
            # A pick or a champion naming another league's membership breaks a foreign key.
            with pytest.raises(Exception, match="violates foreign key"):
                with connection.begin_nested():
                    _insert_pick(connection, {**_name(first), "league_id": second["league_id"]}, recorder, "292585", "home", 7)
            with pytest.raises(Exception, match="violates foreign key"):
                with connection.begin_nested():
                    connection.execute(
                        text("update piele.seasons set previous_champion_membership_id = :m where id = :s"),
                        {"m": first["membership_id"], "s": second["season_id"]},
                    )
            connection.execute(
                text("update piele.seasons set previous_champion_membership_id = :m where id = :s"),
                {"m": second["membership_id"], "s": second["season_id"]},
            )
            connection.execute(text("select set_config('piele.league_id', :l, true)"), {"l": first["league_id"]})
            assert name_picks(first) == 1

            # An account claims Mo in the first league and picks. Another account reads the
            # pick in the first league's context only, and cannot change it from the second.
            mo = _new_account(connection)
            connection.execute(
                text("update piele.league_memberships set user_id = :u where id = :m"), {"u": mo, "m": first["membership_id"]}
            )
            _insert_pick(connection, {"user_id": mo}, mo, "292590", "away", 4)
            _new_account(connection)
            account_picks = lambda: connection.execute(  # noqa: E731
                text("select count(*) from piele.picks where user_id = :u"), {"u": mo}
            ).scalar_one()
            assert account_picks() == 1
            connection.execute(text("select set_config('piele.league_id', :l, true)"), {"l": second["league_id"]})
            assert account_picks() == 0
            changed = connection.execute(text("update piele.picks set margin = 9 where user_id = :u"), {"u": mo}).rowcount
            assert changed == 0
            connection.execute(text("select set_config('piele.league_id', '', true)"))
            assert account_picks() == 0
