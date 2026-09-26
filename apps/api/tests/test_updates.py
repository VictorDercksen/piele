"""Round updates for the notifications panel and the member's read state. The event builder
is tested without a database; the route, milestone persistence and read state need
PIELE_TEST_DATABASE_URL like tests/test_league.py."""

import json
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.agent import previews
from app.competitions.urc_2026_27 import COMPETITION as URC
from app.config import Settings
from app.db import get_engine
from app.main import create_app
from app.matchcentre import service as service_module
from app.matchcentre.cache import MemorySnapshotCache
from app.matchcentre.milestones import FULL_TIME, TEAMSHEETS_PUBLISHED, Milestone
from app.matchcentre.updates import build_events, teamsheets_due
from tests.test_league import SECRET, SUPABASE_URL, captain_headers, lp, new_league
from tests.test_scores import feed_match, round_feed

DATABASE_URL = os.environ.get("PIELE_TEST_DATABASE_URL")
needs_database = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")

FIXTURE = "292584"  # Benetton v Dragons, round 1, 2026-09-25 18:45 UTC
KICKOFF = datetime(2026, 9, 25, 18, 45, tzinfo=timezone.utc)
ROUND_ONE = URC.schedule().round(1)


def milestone(fixture_id: str, kind: str, at: datetime, **detail) -> Milestone:
    return Milestone(fixture_id, kind, at, dict(detail))


def test_teamsheets_are_looked_for_from_three_days_before_until_two_days_after() -> None:
    fixture = URC.schedule().fixture(FIXTURE)
    assert not teamsheets_due(fixture, KICKOFF - timedelta(days=3, minutes=1))
    assert teamsheets_due(fixture, KICKOFF - timedelta(days=2, hours=23))
    assert teamsheets_due(fixture, KICKOFF + timedelta(days=1, hours=23))
    assert not teamsheets_due(fixture, KICKOFF + timedelta(days=2, minutes=1))
    playoff = next(f for f in URC.schedule().fixtures if f.home_id is None)
    assert not teamsheets_due(playoff, KICKOFF)


def test_events_come_from_milestones_previews_and_live_states_in_time_order() -> None:
    fixtures = ROUND_ONE[:2]
    first, second = fixtures
    seen = KICKOFF - timedelta(days=2)
    known = {
        (first.id, TEAMSHEETS_PUBLISHED): milestone(first.id, TEAMSHEETS_PUBLISHED, seen),
        (first.id, FULL_TIME): milestone(first.id, FULL_TIME, KICKOFF + timedelta(hours=2), home=24, away=19),
    }
    stored = {second.id: SimpleNamespace(revision=2, generated_at=KICKOFF - timedelta(days=1))}
    # The score feed is down for the finished match, so its kick-off is inferred from full time.
    matches = {second.id: {"state": "live"}}
    events = build_events(fixtures, known, stored, matches)
    assert [(e["kind"], e["fixtureId"]) for e in events] == [
        (TEAMSHEETS_PUBLISHED, first.id),
        ("preview_published", second.id),
        ("kicked_off", first.id),
        ("kicked_off", second.id),
        (FULL_TIME, first.id),
    ]
    assert events[1]["revision"] == 2
    assert events[2]["occurredAt"] == first.kickoff_utc
    assert events[4] == {
        "kind": FULL_TIME,
        "fixtureId": first.id,
        "occurredAt": KICKOFF + timedelta(hours=2),
        "homeScore": 24,
        "awayScore": 19,
    }


def test_scheduled_matches_without_milestones_report_nothing() -> None:
    assert build_events(ROUND_ONE, {}, {}, {f.id: {"state": "scheduled"} for f in ROUND_ONE}) == []


# Database-backed: the route, milestone persistence and the member's read state ------------


def _side(prefix: str, offset: int) -> dict:
    players = [
        {
            "id": n + offset,
            "name": f"{prefix} {n}",
            "knownName": f"{prefix} {n}",
            "position": {"name": "Prop" if n == 1 else None, "shirtNumber": n, "onFieldId": 1 if n <= 15 else 2},
        }
        for n in range(1, 24)
    ]
    return {"team": {"id": offset or 1, "name": prefix}, "players": players}


class Feeds:
    """The URC feed behind a MockTransport: published teamsheets for chosen fixtures only."""

    def __init__(self) -> None:
        self.published: set[str] = set()
        self.scores = round_feed()
        self.down = False
        self.teamsheet_requests: list[int] = []
        self.score_requests = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url.host == "www.unitedrugby.com", request.url
        if self.down:
            return httpx.Response(503, json={"error": "down"})
        body = json.loads(request.content)
        if "query RoundScores" in body["query"]:
            self.score_requests += 1
            return httpx.Response(200, json=self.scores)
        if "query Bios" in body["query"]:
            return httpx.Response(200, json={"data": {"players": []}})
        (match_id,) = body["variables"]["ids"]
        self.teamsheet_requests.append(match_id)
        stats = {"id": match_id, "matchStatus": "fixture"}
        if str(match_id) in self.published:
            stats.update(homeTeam=_side("Home", 0), awayTeam=_side("Away", 100))
        row = {"match_id": match_id, "match_status": "fixture", "stats_data": stats}
        return httpx.Response(200, json={"data": {"matchstats": [row]}})


@pytest.fixture
def feeds() -> Feeds:
    return Feeds()


@pytest.fixture
def clock(monkeypatch):
    """Sets the match centre clock; the route reads it on every request."""
    state = {"now": KICKOFF - timedelta(days=10)}
    monkeypatch.setattr(service_module, "now_utc", lambda: state["now"])

    def set_now(moment: datetime) -> None:
        state["now"] = moment

    return set_now


@pytest.fixture
def client(feeds: Feeds, clock) -> TestClient:
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=DATABASE_URL,
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=SECRET,
        supabase_service_role_key="service-key",
    )
    email = f"captain-{uuid4().hex[:8]}@example.com"
    with get_engine(settings).begin() as connection:
        league_id = new_league(connection, email)
    app = create_app(
        settings, http_transport=httpx.MockTransport(feeds.handler), snapshot_cache=MemorySnapshotCache()
    )
    client = TestClient(app)
    client.league_id = league_id  # type: ignore[attr-defined]
    client.captain_email = email  # type: ignore[attr-defined]
    client.subjects = {}  # type: ignore[attr-defined]
    return client


@needs_database
def test_round_updates_need_a_member(client: TestClient) -> None:
    assert client.get("/v1/competitions/urc-2026-27/rounds/1/updates").status_code == 401
    assert client.get("/v1/competitions/urc-2026-27/rounds/99/updates", headers=captain_headers(client)).status_code == 404


@needs_database
def test_teamsheet_milestones_keep_their_first_time(client: TestClient, feeds: Feeds, clock) -> None:
    headers = captain_headers(client)
    clock(KICKOFF - timedelta(days=10))
    before = client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]
    if before:
        # Milestones are global and append-only; a database that already holds Round 1's
        # cannot show the first observation again. CI starts from an empty database.
        pytest.skip("Round 1 milestones already recorded in this database")
    assert feeds.teamsheet_requests == []

    seen = KICKOFF - timedelta(days=2)
    clock(seen)
    feeds.published.add(FIXTURE)
    events = client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]
    assert events == [{"kind": "teamsheets_published", "fixtureId": FIXTURE, "occurredAt": "2026-09-23T18:45:00Z", "revision": None, "homeScore": None, "awayScore": None}]
    # Every fixture in the window was looked at once; the published one is not asked again.
    assert sorted(feeds.teamsheet_requests) == sorted(int(f.id) for f in ROUND_ONE)

    clock(seen + timedelta(hours=7))  # past the published snapshot's TTL
    later = client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]
    assert later[0]["occurredAt"] == "2026-09-23T18:45:00Z"
    assert feeds.teamsheet_requests.count(int(FIXTURE)) == 1


@needs_database
def test_full_time_is_recorded_once_and_survives_a_feed_outage(client: TestClient, feeds: Feeds, clock) -> None:
    headers = captain_headers(client)
    clock(KICKOFF - timedelta(days=10))
    if any(e["kind"] == "full_time" for e in client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]):
        pytest.skip("Round 1 full-time milestones already recorded in this database")
    final = feed_match(int(FIXTURE), status="result", period="post match", minute=81, finalised=1, score=(24, 19), ht=(10, 7))
    feeds.scores = round_feed(final)
    clock(KICKOFF + timedelta(hours=3))
    events = client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]
    kinds = {(e["kind"], e["fixtureId"]) for e in events}
    assert ("kicked_off", FIXTURE) in kinds
    full_time = next(e for e in events if e["kind"] == "full_time")
    assert (full_time["homeScore"], full_time["awayScore"]) == (24, 19)
    assert full_time["occurredAt"] == "2026-09-25T21:45:00Z"

    feeds.down = True
    clock(KICKOFF + timedelta(days=5))
    again = client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]
    assert [e for e in again if e["fixtureId"] == FIXTURE and e["kind"] in ("kicked_off", "full_time")] == [
        e for e in events if e["fixtureId"] == FIXTURE and e["kind"] in ("kicked_off", "full_time")
    ]


@needs_database
def test_stored_previews_are_reported(client: TestClient, clock) -> None:
    headers = captain_headers(client)
    settings = client.app.state.settings
    with get_engine(settings).begin() as connection:
        row, created = previews.save(
            connection,
            {
                "competition_id": URC.id,
                "fixture_id": FIXTURE,
                "generated_at": KICKOFF - timedelta(days=1),
                "inputs_hash": "a" * 64,
                "teamsheet_hash": "b" * 64,
                "summary": "A preview.",
                "key_factors": {"home": [], "away": []},
                "sentiment": {"home": {"score": 0, "note": "", "sources": []}, "away": {"score": 0, "note": "", "sources": []}},
                "sources": [],
                "models": {},
                "usage": None,
                "run_id": f"test-{uuid4().hex}",
            },
        )
    assert created
    clock(KICKOFF - timedelta(hours=12))
    events = client.get("/v1/competitions/urc-2026-27/rounds/1/updates", headers=headers).json()["events"]
    preview = next(e for e in events if e["kind"] == "preview_published")
    assert preview["fixtureId"] == FIXTURE and preview["revision"] == row.revision
    assert preview["occurredAt"] == "2026-09-24T18:45:00Z"


@needs_database
def test_members_keep_their_notification_read_state(client: TestClient) -> None:
    headers = captain_headers(client)
    me = client.get(lp(client, "/me"), headers=headers).json()
    assert me["notificationsReadAt"] is None and me["notificationsReadKeys"] == []

    first = client.put(lp(client, "/me/notifications"), json={"readAt": "2026-09-20T08:00:00Z", "readKeys": ["feed:1", " feed:2 ", "feed:1"]}, headers=headers)
    assert first.status_code == 200
    assert first.json() == {"readAt": "2026-09-20T08:00:00Z", "readKeys": ["feed:1", "feed:2"]}

    # A stale device cannot move the mark back; its keys join the newer ones.
    stale = client.put(lp(client, "/me/notifications"), json={"readAt": "2026-09-19T08:00:00Z", "readKeys": ["feed:3"]}, headers=headers).json()
    assert stale == {"readAt": "2026-09-20T08:00:00Z", "readKeys": ["feed:3", "feed:1", "feed:2"]}
    # Mark all read: the mark moves up and the keys are cleared client-side, kept server-side.
    cleared = client.put(lp(client, "/me/notifications"), json={"readAt": "2026-09-21T08:00:00Z", "readKeys": []}, headers=headers).json()
    assert cleared["readAt"] == "2026-09-21T08:00:00Z"
    # A mark in the future is held at the server clock.
    ahead = client.put(lp(client, "/me/notifications"), json={"readAt": "2999-01-01T00:00:00Z", "readKeys": []}, headers=headers).json()
    assert ahead["readAt"] < "2999"
    assert client.get(lp(client, "/me"), headers=headers).json()["notificationsReadAt"] == ahead["readAt"]

    too_many = client.put(lp(client, "/me/notifications"), json={"readAt": None, "readKeys": [f"k{i}" for i in range(201)]}, headers=headers)
    assert too_many.status_code == 422
    too_long = client.put(lp(client, "/me/notifications"), json={"readAt": None, "readKeys": ["x" * 121]}, headers=headers)
    assert too_long.status_code == 422
