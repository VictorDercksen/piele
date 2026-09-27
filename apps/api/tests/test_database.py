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


# Superbru picks and rules (20260927110000_picks_and_rules.sql) ---------------------------


def _new_league(connection) -> dict:
    """A bootstrapped league with its context set: its id, season and Mo's memberships."""
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


def _insert_pick(connection, league: dict, fixture_id: str, side: str, margin, **extra) -> None:
    columns = {
        "league_id": league["league_id"],
        "season_id": league["season_id"],
        "season_membership_id": league["season_membership_id"],
        "fixture_id": fixture_id,
        "side": side,
        "margin": margin,
        "recorded_by_membership_id": league["membership_id"],
        "is_default": False,
        **extra,
    }
    connection.execute(
        text(f"insert into piele.picks ({', '.join(columns)}) values ({', '.join(':' + key for key in columns)})"), columns
    )


def test_pick_constraints_keep_picks_well_formed(settings: Settings) -> None:
    with get_engine(settings).connect() as connection:
        with connection.begin():
            league = _new_league(connection)
            _insert_pick(connection, league, "292584", "home", 7)
            _insert_pick(connection, league, "292585", "draw", 0)
            _insert_pick(connection, league, "292586", "missed", None)
            _insert_pick(connection, league, "292587", "away", 3, is_default=True)
            for fixture_id, side, margin, extra in (
                ("292588", "draw", 5, {}),
                ("292588", "home", 0, {}),
                ("292588", "home", 151, {}),
                ("292588", "missed", 3, {}),
                ("292588", "sideways", 3, {}),
                ("292588", "draw", 0, {"is_default": True}),
                ("292584", "away", 2, {}),  # one pick per member and fixture
            ):
                with pytest.raises(Exception, match="violates"):
                    with connection.begin_nested():
                        _insert_pick(connection, league, fixture_id, side, margin, **extra)
            rules = connection.execute(
                text("select rules, previous_champion_membership_id from piele.seasons where id = :s"), {"s": league["season_id"]}
            ).one()
            assert (rules.rules, rules.previous_champion_membership_id) == ({}, None)


def test_picks_and_champions_stay_in_their_league(settings: Settings) -> None:
    with get_engine(settings).connect() as connection:
        with connection.begin():
            first = _new_league(connection)
            _insert_pick(connection, first, "292584", "home", 7)
            second = _new_league(connection)
            # The first league's picks are invisible in the second league's context and cannot
            # be written there.
            assert connection.execute(text("select count(*) from piele.picks where league_id = :l"), {"l": first["league_id"]}).scalar_one() == 0
            with pytest.raises(Exception, match="row-level security"):
                with connection.begin_nested():
                    _insert_pick(connection, first, "292585", "home", 7)
            # A pick, a duty link or a champion from another league breaks a foreign key.
            with pytest.raises(Exception, match="violates foreign key"):
                with connection.begin_nested():
                    _insert_pick(connection, {**second, "season_membership_id": first["season_membership_id"]}, "292585", "home", 7)
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
            assert connection.execute(text("select count(*) from piele.picks where league_id = :l"), {"l": first["league_id"]}).scalar_one() == 1
