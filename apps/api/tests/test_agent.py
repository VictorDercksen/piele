"""Preview agent boundary: token auth, fixture state features, the due rule and stored
previews. Storage tests need PIELE_TEST_DATABASE_URL like tests/test_database.py."""

import json
import os
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.agent import state as state_module
from app.agent import previews
from app.agent.previews import DISPATCH_LEASE, MAX_DISPATCHES, due_reason, open_for_preview
from app.competitions.urc_2026_27 import COMPETITION as URC
from app.config import Settings
from app.db import get_engine
from app.main import create_app
from app.matchcentre.cache import MemorySnapshotCache
from app.routers import agent as agent_router
from tests.test_league import SECRET, SUPABASE_URL, auth, captain_headers, client, storage  # noqa: F401

DATABASE_URL = os.environ.get("PIELE_TEST_DATABASE_URL")
needs_database = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")

TOKEN = "agent-token-" + "x" * 32
AGENT = {"Authorization": f"Bearer {TOKEN}"}
FIXTURE = "292605"  # Scarlets v Benetton, round 3, 2026-10-10 16:30 UTC at Parc y Scarlets
KICKOFF = datetime(2026, 10, 10, 16, 30, tzinfo=timezone.utc)
DAY_BEFORE = KICKOFF - timedelta(days=1)


class Feed:
    """The URC feed and Open-Meteo behind a MockTransport, with line-ups for any fixture.

    Every Benetton side has `Benetton Ten` at 10 until round 3, where `New Ten` starts and
    `Benetton Ten` moves to the bench, and the 12 and 13 swap shirts.
    """

    def __init__(self) -> None:
        self.variant = ""

    def lineup(self, fixture_id: str, team_id: str) -> list[dict]:
        short = URC.club(team_id).short_name
        names = {n: f"{short} {n}" for n in range(1, 24)}
        benches = ["Prop", "Hooker", "Prop", "Lock", "Flanker", "Scrum-half", "Fly-half", "Wing"]
        if team_id == "benetton-rugby":
            names[10] = "Benetton Ten"
            if fixture_id == FIXTURE:
                names[10], names[22] = "New Ten", "Benetton Ten"
                names[12], names[13] = names[13], names[12]
        if self.variant and team_id == "benetton-rugby" and fixture_id == FIXTURE:
            names[15] = self.variant
        return [
            {
                "id": abs(hash((fixture_id, team_id, n))) % 10_000_000,
                "name": names[n],
                "knownName": names[n],
                "position": {"name": benches[n - 16] if n > 15 else None, "shirtNumber": n},
            }
            for n in range(1, 24)
        ]

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.open-meteo.com":
            hours = ["2026-10-10T16:00", "2026-10-10T17:00"]
            fields = ["temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation"]
            fields += ["wind_speed_10m", "wind_gusts_10m", "weather_code", "is_day"]
            return httpx.Response(200, json={"hourly": {"time": hours, **{f: [1, 1] for f in fields}}})
        body = json.loads(request.content)
        if "query Bios" in body["query"]:
            players = [{"id": i, "player_data": {"dob": "1996-10-10T00:00:00Z"}} for i in body["variables"]["ids"]]
            return httpx.Response(200, json={"data": {"players": players}})
        fixture = URC.schedule().fixture(str(body["variables"]["ids"][0]))
        stats = {
            "homeTeam": {"players": self.lineup(fixture.id, fixture.home_id)},
            "awayTeam": {"players": self.lineup(fixture.id, fixture.away_id)},
        }
        return httpx.Response(200, json={"data": {"matchstats": [{"match_id": int(fixture.id), "stats_data": stats}]}})


def agent_client(monkeypatch, now: datetime, feed: Feed | None = None, **overrides) -> TestClient:
    monkeypatch.setattr(agent_router, "now_utc", lambda: now)
    settings = Settings(_env_file=None, environment="test", piele_agent_token=TOKEN, **overrides)
    app = create_app(
        settings,
        http_transport=httpx.MockTransport((feed or Feed()).handler),
        snapshot_cache=MemorySnapshotCache(),
    )
    return TestClient(app)


# Token -------------------------------------------------------------------------------


def test_agent_routes_are_off_without_a_configured_token() -> None:
    app = create_app(Settings(_env_file=None, environment="test"))
    response = TestClient(app).get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "agent_unconfigured"


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": f"Basic {TOKEN}"}])
def test_agent_routes_reject_a_missing_or_wrong_token(monkeypatch, headers) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    for path in (f"/v1/agent/fixtures/{FIXTURE}/state", "/v1/agent/fixtures/due"):
        assert client.get(path, headers=headers).status_code == 401
    assert client.post("/v1/agent/previews", json={}, headers=headers).status_code == 401
    assert client.post("/v1/agent/dispatches", headers=headers).status_code == 401


def test_a_member_token_is_not_an_agent_token(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    member = auth(uuid4(), "someone@example.com")
    assert client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=member).status_code == 401


def test_production_refuses_a_short_agent_token() -> None:
    with pytest.raises(ValueError, match="PIELE_AGENT_TOKEN"):
        Settings(
            _env_file=None,
            environment="production",
            ALLOWED_ORIGINS="https://piele.example",
            database_url="postgresql://u:p@db/x",
            piele_agent_token="short",
        )


def test_due_and_dispatches_need_the_database(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    assert client.get("/v1/agent/fixtures/due", headers=AGENT).status_code == 503
    assert client.post("/v1/agent/dispatches", headers=AGENT).status_code == 503


# Fixture state ------------------------------------------------------------------------


def test_state_reports_teamsheet_features_travel_rest_and_weather(monkeypatch) -> None:
    body = agent_client(monkeypatch, DAY_BEFORE).get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()

    assert body["fixtureId"] == FIXTURE
    assert (body["venue"], body["country"], body["teamsheetStatus"]) == ("Parc y Scarlets", "Wales", "ok")
    assert body["weather"]["status"] == "ok"
    assert body["form"]["status"] == "unavailable"
    assert len(body["teamsheetHash"]) == 64 and len(body["stateHash"]) == 64

    home, away = body["home"], body["away"]
    assert home["features"]["travel"] == "home"
    assert away["club"]["id"] == "benetton-rugby"
    assert [f["fixtureId"] for f in away["recentFixtures"]] == ["292594", "292584"]

    features = away["features"]
    assert features["restDays"] == 7
    assert features["travel"] == "cross_border"
    assert features["changesFromPrevious"] == {
        "comparedWith": "292594",
        "startersIn": ["New Ten"],
        "startersOut": ["Benetton Ten"],
        "shirtChanges": [
            {"name": "Benetton 13", "from": 13, "to": 12},
            {"name": "Benetton 12", "from": 12, "to": 13},
        ],
    }
    assert features["regularStartersMissing"] == [{"name": "Benetton Ten", "starts": 2, "of": 2, "onBench": True}]
    assert features["ages"] == {"starters": 30.0, "forwards": 30.0, "backs": 30.0, "replacements": 30.0, "known": 23}
    assert features["bench"] == {"forwards": 5, "backs": 3, "unknown": 0}


def test_state_is_refused_after_kickoff_and_for_unknown_fixtures(monkeypatch) -> None:
    client = agent_client(monkeypatch, KICKOFF)
    assert client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()["detail"]["code"] == "kicked_off"
    assert client.get("/v1/agent/fixtures/nope/state", headers=AGENT).status_code == 404


def test_state_without_published_teamsheets_has_no_teamsheet_hash(monkeypatch) -> None:
    client = agent_client(monkeypatch, KICKOFF - timedelta(days=5))
    body = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert body["teamsheetStatus"] == "not_published"
    assert body["teamsheetHash"] is None
    assert body["away"]["teamsheet"] is None
    assert body["away"]["features"]["changesFromPrevious"] is None


def test_travel_classes() -> None:
    assert state_module.travel("home", "Wales", "Wales") == "home"
    assert state_module.travel("away", "Wales", "Wales") == "domestic"
    assert state_module.travel("away", "Italy", "Wales") == "cross_border"
    assert state_module.travel("away", "South Africa", "Ireland") == "intercontinental"
    assert state_module.travel("away", "Ireland", "South Africa") == "intercontinental"
    assert state_module.travel("away", "Ireland", None) is None


def test_position_groups() -> None:
    forwards = ["Loosehead Prop", "Hooker", "Lock", "Second Row", "Blindside Flanker", "Number 8", "Back Row"]
    backs = ["Scrum-half", "Fly-half", "Outside Centre", "Wing", "Full-back", "Utility Back"]
    assert {state_module.position_group(p) for p in forwards} == {"forward"}
    assert {state_module.position_group(p) for p in backs} == {"back"}
    assert state_module.position_group("Replacement") is None
    assert state_module.position_group(None) is None


def test_ages_skip_unknown_birth_dates() -> None:
    sheet = {
        "starters": [{"number": 1, "dateOfBirth": "2000-01-01"}, {"number": 9, "dateOfBirth": None}],
        "replacements": [{"number": 16, "dateOfBirth": "not a date"}],
    }
    assert state_module.ages(sheet, date(2026, 1, 1)) == {
        "starters": 26.0,
        "forwards": 26.0,
        "backs": None,
        "replacements": None,
        "known": 1,
    }


def test_teamsheet_hash_follows_the_line_ups_only() -> None:
    def section(name: str, fetched: str) -> dict:
        side = {"starters": [{"number": 1, "name": name, "position": "Prop", "dateOfBirth": fetched}], "replacements": []}
        return {"status": "ok", "fetchedAt": fetched, "home": side, "away": side}

    assert state_module.teamsheet_hash(section("A", "x")) == state_module.teamsheet_hash(section("A", "y"))
    assert state_module.teamsheet_hash(section("A", "x")) != state_module.teamsheet_hash(section("B", "x"))
    assert state_module.teamsheet_hash({"status": "not_published"}) is None


# Due rule -----------------------------------------------------------------------------


def test_due_reasons() -> None:
    kickoff, now = KICKOFF, DAY_BEFORE
    preview = SimpleNamespace(teamsheet_hash="a" * 64, generated_at=now - timedelta(hours=9))
    claimed = SimpleNamespace(attempt=1, dispatched_at=now - timedelta(minutes=5))
    lapsed = SimpleNamespace(attempt=1, dispatched_at=now - DISPATCH_LEASE)
    spent = SimpleNamespace(attempt=MAX_DISPATCHES, dispatched_at=now - timedelta(days=1))

    assert due_reason(kickoff, now, None, None, None) is None  # teamsheets not published
    assert due_reason(kickoff, now, "a" * 64, None, None) == "first_preview"
    assert due_reason(kickoff, now, "a" * 64, None, claimed) is None  # a session may be writing
    assert due_reason(kickoff, now, "a" * 64, None, lapsed) == "retry"
    assert due_reason(kickoff, now, "a" * 64, None, spent) is None
    # One preview per fixture: changed teamsheets and approaching kickoff do not rewrite it.
    assert due_reason(kickoff, now, "b" * 64, preview, None) is None
    assert due_reason(kickoff, kickoff - timedelta(hours=1), "a" * 64, preview, None) is None
    assert due_reason(kickoff, kickoff, "a" * 64, None, None) is None  # never after kickoff
    # A forced run skips the preview, lease and attempt checks, but not teamsheets or kickoff.
    for preview_row, dispatch_row in ((preview, None), (None, claimed), (None, spent)):
        assert due_reason(kickoff, now, "a" * 64, preview_row, dispatch_row, force=True) == "forced"
    assert due_reason(kickoff, now, None, None, None, force=True) is None
    assert due_reason(kickoff, kickoff, "a" * 64, None, None, force=True) is None


def test_only_fixtures_inside_the_teamsheet_window_are_open() -> None:
    fixture = URC.schedule().fixture(FIXTURE)
    assert open_for_preview(fixture, KICKOFF - timedelta(days=3))
    assert not open_for_preview(fixture, KICKOFF - timedelta(days=3, minutes=1))
    assert not open_for_preview(fixture, KICKOFF)


# Submissions --------------------------------------------------------------------------


def submission(state: dict, **overrides) -> dict:
    body = {
        "fixtureId": FIXTURE,
        "inputsHash": state["stateHash"],
        "teamsheetHash": state["teamsheetHash"],
        "summary": "Scarlets host a Benetton side with a new 10.\nThe forecast is dry.",
        "keyFactors": {
            "home": [{"text": "Unchanged front row.", "sources": [0]}],
            "away": [{"text": "New Ten starts at fly-half.", "sources": [0, 1]}],
        },
        "sentiment": {
            "home": {"score": 1, "note": "Settled camp.", "sources": [0]},
            "away": {"score": -1, "note": "Selection questions.", "sources": [1]},
        },
        "sources": [
            {"url": "https://www.unitedrugby.com/news/teams", "title": "Team news", "publisher": "URC"},
            {"url": "http://example.org/benetton", "title": "Benetton selection", "publishedAt": "2026-10-08T10:00:00Z"},
        ],
        "models": {"writer": "anthropic/claude-opus-5", "researcher": "anthropic/claude-sonnet-5"},
        "usage": {"inputTokens": 1200, "outputTokens": 400, "webSearches": 6},
        "runId": f"run-{uuid4().hex}",
    }
    body.update(overrides)
    return body


FAKE_STATE = {"stateHash": "c" * 64, "teamsheetHash": "d" * 64}


@pytest.mark.parametrize(
    "overrides",
    [
        {"sources": [{"url": "javascript:alert(1)", "title": "x"}]},
        {"sources": [{"url": "ftp://example.org/x", "title": "x"}]},
        {"sources": []},
        {"summary": "   "},
        {"summary": "x" * 1501},
        {"summary": "bell \x07"},
        {"inputsHash": "not-a-hash"},
        {"sentiment": {"home": {"score": 3, "note": "x", "sources": [0]}, "away": {"score": 0, "note": "x", "sources": [0]}}},
        {"keyFactors": {"home": [{"text": "x", "sources": [5]}], "away": []}},
        {"keyFactors": {"home": [{"text": "uncited", "sources": []}], "away": []}},
        {"keyFactors": {"home": [{"text": "x", "sources": [0]}] * 7, "away": []}},
        {"odds": {"home": 1.5}},
        {"runId": "has spaces"},
    ],
)
def test_invalid_submissions_are_rejected(monkeypatch, overrides) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    response = client.post("/v1/agent/previews", json=submission(FAKE_STATE, **overrides), headers=AGENT)
    assert response.status_code == 422


@needs_database
def test_submissions_after_kickoff_or_for_unknown_fixtures_are_refused(monkeypatch) -> None:
    client = agent_client(monkeypatch, KICKOFF, database_url=DATABASE_URL)
    response = client.post("/v1/agent/previews", json=submission(FAKE_STATE), headers=AGENT)
    assert response.json()["detail"]["code"] == "kicked_off"
    response = client.post("/v1/agent/previews", json=submission(FAKE_STATE, fixtureId="nope"), headers=AGENT)
    assert response.status_code == 404


@needs_database
def test_previews_are_stored_as_revisions_and_retries_are_idempotent(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    body = submission(state)

    first = client.post("/v1/agent/previews", json=body, headers=AGENT)
    assert first.status_code == 201
    retried = client.post("/v1/agent/previews", json=body, headers=AGENT)
    assert retried.status_code == 200
    assert retried.json() == first.json()

    second = client.post("/v1/agent/previews", json=submission(state), headers=AGENT)
    assert second.status_code == 201
    assert second.json()["revision"] == first.json()["revision"] + 1


@needs_database
def test_a_fixture_with_a_preview_is_not_due_again(monkeypatch) -> None:
    feed = Feed()
    client = agent_client(monkeypatch, DAY_BEFORE, feed, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert client.post("/v1/agent/previews", json=submission(state), headers=AGENT).status_code == 201

    due = client.get("/v1/agent/fixtures/due", headers=AGENT).json()["fixtures"]
    assert FIXTURE not in [f["fixtureId"] for f in due]
    assert all(DAY_BEFORE < datetime.fromisoformat(f["kickoffUtc"]) <= DAY_BEFORE + timedelta(days=3) for f in due)

    # Neither a new line-up (fresh cache) nor the last hours before kickoff bring it back.
    feed.variant = "Late Call-up"
    for now in (DAY_BEFORE, KICKOFF - timedelta(hours=1)):
        later = agent_client(monkeypatch, now, feed, database_url=DATABASE_URL)
        due = later.get("/v1/agent/fixtures/due", headers=AGENT).json()["fixtures"]
        assert FIXTURE not in [f["fixtureId"] for f in due]


def rolled_back(test):
    """Runs test(connection) as the runtime role inside a transaction that is rolled back."""
    engine = get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL))
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            test(connection)
        finally:
            transaction.rollback()


def fresh_fixture():
    """A copy of FIXTURE under an id no stored preview or dispatch uses."""
    return replace(URC.schedule().fixture(FIXTURE), id=f"t{uuid4().hex[:12]}")


@needs_database
def test_claims_hold_for_the_lease_and_stop_after_the_last_attempt() -> None:
    def test(connection) -> None:
        fixture, now = fresh_fixture(), DAY_BEFORE
        hashes = {fixture: "a" * 64}
        for attempt in range(1, MAX_DISPATCHES + 1):
            (due,) = previews.due_fixtures(connection, URC.id, hashes, now)
            assert (due["attempt"], due["reason"]) == (attempt, "first_preview" if attempt == 1 else "retry")
            assert previews.claim(connection, due, now)["dispatchedAt"] == now
            # Claimed: not due, and a second claim of the same attempt is refused.
            assert previews.due_fixtures(connection, URC.id, hashes, now + DISPATCH_LEASE - timedelta(seconds=1)) == []
            assert previews.claim(connection, due, now) is None
            now += DISPATCH_LEASE
        assert previews.due_fixtures(connection, URC.id, hashes, now + timedelta(days=1)) == []

    rolled_back(test)


@needs_database
def test_a_saved_preview_ends_the_claims() -> None:
    def test(connection) -> None:
        fixture = fresh_fixture()
        hashes = {fixture: "a" * 64}
        (due,) = previews.due_fixtures(connection, URC.id, hashes, DAY_BEFORE)
        previews.claim(connection, due, DAY_BEFORE)
        values = submission(FAKE_STATE)
        previews.save(
            connection,
            {
                "competition_id": URC.id,
                "fixture_id": fixture.id,
                "inputs_hash": values["inputsHash"],
                "teamsheet_hash": values["teamsheetHash"],
                "summary": values["summary"],
                "key_factors": values["keyFactors"],
                "sentiment": values["sentiment"],
                "sources": values["sources"],
                "models": values["models"],
                "run_id": values["runId"],
            },
        )
        assert previews.due_fixtures(connection, URC.id, hashes, DAY_BEFORE + DISPATCH_LEASE * 2) == []

    rolled_back(test)


@needs_database
def test_a_forced_claim_ignores_the_lease_the_attempt_limit_and_a_saved_preview() -> None:
    def test(connection) -> None:
        fixture, now = fresh_fixture(), DAY_BEFORE
        hashes = {fixture: "a" * 64}
        for attempt in range(1, MAX_DISPATCHES + 2):
            (due,) = previews.due_fixtures(connection, URC.id, hashes, now, force=True)
            assert (due["attempt"], due["reason"]) == (attempt, "forced")
            assert previews.claim(connection, due, now) is not None
        assert previews.due_fixtures(connection, URC.id, hashes, now) == []

    rolled_back(test)


@pytest.mark.parametrize(
    ("body", "status"),
    [({"force": True}, 422), ({"fixtureId": "nope"}, 422), ({"fixtureId": "999999"}, 404), ({"odd": 1}, 422)],
)
@needs_database
def test_dispatch_requests_are_validated(monkeypatch, body, status) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    assert client.post("/v1/agent/dispatches", json=body, headers=AGENT).status_code == status


@needs_database
def test_a_forced_dispatch_claims_one_fixture_every_time(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    body = {"fixtureId": FIXTURE, "force": True}
    first = client.post("/v1/agent/dispatches", json=body, headers=AGENT).json()["dispatches"]
    second = client.post("/v1/agent/dispatches", json=body, headers=AGENT).json()["dispatches"]
    assert [d["fixtureId"] for d in first + second] == [FIXTURE, FIXTURE]
    assert second[0]["attempt"] == first[0]["attempt"] + 1
    assert first[0]["reason"] == "forced"
    # After kickoff even a forced run is refused.
    late = agent_client(monkeypatch, KICKOFF, database_url=DATABASE_URL)
    assert late.post("/v1/agent/dispatches", json=body, headers=AGENT).json()["detail"]["code"] == "kicked_off"


@needs_database
def test_dispatches_claim_each_due_fixture_once(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    first = client.post("/v1/agent/dispatches", headers=AGENT)
    assert first.status_code == 200
    claimed = first.json()["dispatches"]
    assert len(claimed) <= previews.DISPATCH_LIMIT
    for entry in claimed:
        assert entry["attempt"] >= 1
        assert DAY_BEFORE < datetime.fromisoformat(entry["kickoffUtc"]) <= DAY_BEFORE + timedelta(days=3)
    # Earlier runs of this test may have used up some claims; none is claimed twice now.
    again = client.post("/v1/agent/dispatches", headers=AGENT).json()["dispatches"]
    assert not {e["fixtureId"] for e in claimed} & {e["fixtureId"] for e in again}


@needs_database
def test_members_read_the_latest_preview(monkeypatch, client: TestClient) -> None:  # noqa: F811
    assert client.get(f"/v1/competitions/urc-2026-27/matches/{FIXTURE}/preview").status_code == 401
    assert client.get("/v1/competitions/urc-2026-27/matches/nope/preview", headers=captain_headers(client)).status_code == 404

    agent = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = agent.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    stored = agent.post("/v1/agent/previews", json=submission(state), headers=AGENT).json()

    body = client.get(f"/v1/competitions/urc-2026-27/matches/{FIXTURE}/preview", headers=captain_headers(client)).json()
    preview = body["preview"]
    assert body["fixtureId"] == FIXTURE
    assert preview["revision"] == stored["revision"]
    assert preview["summary"].startswith("Scarlets host")
    assert preview["sentiment"]["away"]["score"] == -1
    assert preview["sources"][1]["publisher"] is None
    # Provenance and cost stay with the agent's records.
    assert not {"models", "usage", "runId", "inputsHash"} & set(preview)


@needs_database
def test_a_fixture_without_a_preview_reads_as_none(client: TestClient) -> None:  # noqa: F811
    body = client.get("/v1/competitions/urc-2026-27/matches/292700/preview", headers=captain_headers(client)).json()
    assert body == {"fixtureId": "292700", "preview": None}


@needs_database
def test_runtime_role_cannot_rewrite_previews_or_dispatches() -> None:
    engine = get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL))
    statements = (
        "update piele.match_previews set summary = 'x'",
        "delete from piele.match_previews",
        "update piele.preview_dispatches set attempt = 1",
        "delete from piele.preview_dispatches",
    )
    for statement in statements:
        with engine.connect() as connection, pytest.raises(Exception, match="permission denied"):
            connection.execute(text(statement))
