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
