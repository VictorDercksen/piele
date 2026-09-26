"""The competition registry, the /v1/competitions routes, competition-keyed snapshots and
stored competition data, the agent's default competition and round validation per
competition. Database tests need PIELE_TEST_DATABASE_URL like tests/test_database.py."""

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import competitions
from app.agent import previews
from app.competitions.urc_2026_27 import COMPETITION as URC
from app.config import Settings
from app.db import get_engine
from app.league import tables as t
from app.main import create_app
from app.matchcentre import milestones
from app.matchcentre import service as service_module
from app.matchcentre.cache import MemorySnapshotCache
from tests.test_agent import AGENT, DAY_BEFORE, FAKE_STATE, agent_client, rolled_back, submission
from tests.test_agent import FIXTURE as AGENT_FIXTURE
from tests.test_league import SEED, captain_headers, client, lp, new_league, storage  # noqa: F401
from tests.test_matches import FIXTURE, KICKOFF, Upstream

DATABASE_URL = os.environ.get("PIELE_TEST_DATABASE_URL")
needs_database = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")
BASE = "/v1/competitions/urc-2026-27"


# Registry -----------------------------------------------------------------------------


def test_the_registry_knows_the_urc() -> None:
    assert list(competitions.ALL) == ["urc-2026-27"]
    assert competitions.get("urc-2026-27") is URC
    assert competitions.DEFAULT_COMPETITION_ID == "urc-2026-27"
    assert (URC.name, URC.short_name, URC.timezone) == (
        "United Rugby Championship 2026/27",
        "URC",
        "Africa/Johannesburg",
    )
    with pytest.raises(KeyError):
        competitions.get("nope")


def test_rounds_come_from_the_competition() -> None:
    assert (URC.regular_rounds, URC.last_round) == (18, 21)
    assert [URC.round_label(n) for n in (1, 18, 19, 20, 21)] == [
        "Round 01",
        "Round 18",
        "Round QF",
        "Round SF",
        "Round F",
    ]
    assert URC.validate_round(1) == 1 and URC.validate_round(21) == 21
    for outside in (0, 22):
        with pytest.raises(HTTPException) as raised:
            URC.validate_round(outside)
        assert raised.value.status_code == 422
        assert raised.value.detail["code"] == "unknown_round"
    assert URC.first_kickoff(1) == KICKOFF
    assert URC.first_kickoff(99) is None


def test_schedule_and_catalogues_belong_to_the_competition() -> None:
    assert URC.schedule() is URC.schedule()
    assert URC.club("dhl-stormers").short_name == "Stormers"
    assert URC.club("nope") is None and URC.club(None) is None
    assert URC.stadium("stadio monigo").city == "Treviso"
    assert URC.stadium(None) is None


# Routes -------------------------------------------------------------------------------


def centre_client(monkeypatch, now: datetime, cache: MemorySnapshotCache, upstream: Upstream | None = None) -> TestClient:
    monkeypatch.setattr(service_module, "now_utc", lambda: now)
    settings = Settings(_env_file=None, environment="test")
    transport = httpx.MockTransport((upstream or Upstream()).handler)
    return TestClient(create_app(settings, http_transport=transport, snapshot_cache=cache))


@pytest.mark.parametrize(
    "path",
    [
        f"/v1/competitions/nope/matches/{FIXTURE}",
        f"/v1/competitions/nope/matches/{FIXTURE}/preview",
        "/v1/competitions/nope/rounds/1/scores",
        "/v1/competitions/nope/rounds/1/updates",
    ],
)
def test_an_unknown_competition_is_404(monkeypatch, path: str) -> None:
    response = centre_client(monkeypatch, KICKOFF, MemorySnapshotCache()).get(path)
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "unknown_competition"


def test_the_old_match_paths_are_gone(monkeypatch) -> None:
    client = centre_client(monkeypatch, KICKOFF, MemorySnapshotCache())
    assert client.get(f"/v1/matches/{FIXTURE}").status_code == 404
    assert client.get("/v1/rounds/1/scores").status_code == 404


def test_snapshot_keys_start_with_the_competition_id(monkeypatch) -> None:
    cache = MemorySnapshotCache()
    client = centre_client(monkeypatch, KICKOFF - timedelta(days=2), cache)
    body = client.get(f"{BASE}/matches/{FIXTURE}").json()
    assert body["teamsheets"]["status"] == "ok" and body["weather"]["status"] == "ok"

    live = centre_client(monkeypatch, KICKOFF + timedelta(minutes=10), cache)
    assert live.get(f"{BASE}/rounds/1/scores").status_code == 200

    keys = set(cache._items)
    assert {
        f"urc-2026-27:teamsheets:{FIXTURE}",
        f"urc-2026-27:weather:{FIXTURE}",
        "urc-2026-27:scores:round:1",
    } <= keys
    assert all(key.startswith("urc-2026-27:") for key in keys)


# Agent --------------------------------------------------------------------------------


def test_agent_state_defaults_and_echoes_the_competition(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    default = client.get(f"/v1/agent/fixtures/{AGENT_FIXTURE}/state", headers=AGENT).json()
    named = client.get(
        f"/v1/agent/fixtures/{AGENT_FIXTURE}/state", params={"competitionId": "urc-2026-27"}, headers=AGENT
    ).json()
    assert default["competitionId"] == named["competitionId"] == "urc-2026-27"
    assert default["stateHash"] == named["stateHash"]


def test_agent_routes_refuse_an_unknown_competition(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    responses = [
        client.get(f"/v1/agent/fixtures/{AGENT_FIXTURE}/state", params={"competitionId": "nope"}, headers=AGENT),
        client.get("/v1/agent/fixtures/due", params={"competitionId": "nope"}, headers=AGENT),
        client.post("/v1/agent/dispatches", json={"competitionId": "nope"}, headers=AGENT),
        client.post("/v1/agent/previews", json=submission(FAKE_STATE, competitionId="nope"), headers=AGENT),
    ]
    for response in responses:
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "unknown_competition"


@needs_database
def test_agent_dispatches_and_previews_carry_the_default_competition(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    dispatched = client.post(
        "/v1/agent/dispatches", json={"fixtureId": AGENT_FIXTURE, "force": True}, headers=AGENT
    ).json()["dispatches"]
    assert [d["competitionId"] for d in dispatched] == ["urc-2026-27"]

    state = client.get(f"/v1/agent/fixtures/{AGENT_FIXTURE}/state", headers=AGENT).json()
    stored = client.post("/v1/agent/previews", json=submission(state), headers=AGENT).json()
    assert stored["competitionId"] == "urc-2026-27"
    named = client.post(
        "/v1/agent/previews", json=submission(state, competitionId="urc-2026-27"), headers=AGENT
    ).json()
    assert (named["competitionId"], named["revision"]) == ("urc-2026-27", stored["revision"] + 1)

    engine = get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL))
    with engine.connect() as connection:
        row = connection.execute(
            select(previews.preview_dispatches.c.competition_id).where(
                previews.preview_dispatches.c.fixture_id == AGENT_FIXTURE
            )
        ).first()
    assert row.competition_id == "urc-2026-27"


@needs_database
def test_previews_and_milestones_are_kept_per_competition() -> None:
    def test(connection) -> None:
        fixture_id = f"t{uuid4().hex[:12]}"
        values = submission(FAKE_STATE)
        stored = {
            "fixture_id": fixture_id,
            "inputs_hash": values["inputsHash"],
            "teamsheet_hash": values["teamsheetHash"],
            "summary": values["summary"],
            "key_factors": values["keyFactors"],
            "sentiment": values["sentiment"],
            "sources": values["sources"],
            "models": values["models"],
        }
        urc, _ = previews.save(connection, {**stored, "competition_id": URC.id})
        other, _ = previews.save(connection, {**stored, "competition_id": "other-cup"})
        # The same fixture id in another competition starts its own revisions.
        assert (urc.revision, other.revision) == (1, 1)
        assert previews.latest(connection, URC.id, fixture_id).id == urc.id
        assert previews.latest(connection, "other-cup", fixture_id).id == other.id

        seen = datetime(2026, 9, 23, tzinfo=timezone.utc)
        milestones.record(connection, "other-cup", fixture_id, milestones.FULL_TIME, seen, {"home": 1, "away": 0})
        assert milestones.by_fixture(connection, URC.id, [fixture_id]) == {}
        assert list(milestones.by_fixture(connection, "other-cup", [fixture_id])) == [(fixture_id, milestones.FULL_TIME)]

    rolled_back(test)


# League rounds ------------------------------------------------------------------------


@needs_database
def test_the_season_records_its_competition() -> None:
    engine = get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL))
    email = f"captain-{uuid4().hex[:8]}@example.com"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            league_id = new_league(connection, email, {**SEED, "competitionId": "urc-2026-27"})
            season = connection.execute(select(t.seasons.c.competition_id).where(t.seasons.c.league_id == league_id)).one()
            assert season.competition_id == "urc-2026-27"
            with pytest.raises(SystemExit, match="Unknown competition"):
                new_league(connection, f"x-{email}", {**SEED, "competitionId": "nope"})
        finally:
            transaction.rollback()


@needs_database
def test_rounds_are_validated_by_the_season_competition(client: TestClient) -> None:  # noqa: F811
    headers = captain_headers(client)
    members = client.get(lp(client, "/members"), headers=headers).json()
    mo = next(m for m in members if m["displayName"] == "Mo")
    refused = [
        client.get(lp(client, "/standings"), params={"round": 22}, headers=headers),
        client.get(lp(client, "/duties"), params={"round": 22}, headers=headers),
        client.get(lp(client, "/feed"), params={"round": 22}, headers=headers),
        client.get(lp(client, "/duties/default-deadline"), params={"type": "spoon", "round": 22}, headers=headers),
        client.put(lp(client, "/rounds/22/standings"), json={"standings": []}, headers=headers),
        client.post(lp(client, "/duties"), json={"memberId": mo["id"], "type": "spoon", "roundNumber": 22}, headers=headers),
    ]
    for response in refused:
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "unknown_round"

    assert client.get(lp(client, "/standings"), params={"round": 21}, headers=headers).status_code == 200
    deadline = client.get(lp(client, "/duties/default-deadline"), params={"type": "spoon", "round": 1}, headers=headers)
    assert deadline.json()["deadlineAt"] == URC.first_kickoff(2).isoformat().replace("+00:00", "Z")
    last = client.get(lp(client, "/duties/default-deadline"), params={"type": "spoon", "round": 21}, headers=headers)
    assert last.json() == {"deadlineAt": None}
    playoff = client.post(lp(client, "/duties"), json={"memberId": mo["id"], "type": "pick_confirmation", "roundNumber": 19}, headers=headers)
    assert playoff.status_code == 201 and playoff.json()["title"] == "Round QF Pick confirmation"
