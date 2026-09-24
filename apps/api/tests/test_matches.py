import json
from datetime import datetime, timedelta, timezone

import httpx
from fastapi.testclient import TestClient

from app.config import Settings
from app.matchcentre import service as service_module
from app.matchcentre.cache import Fetched, MemorySnapshotCache, ProviderError, cached
from app.matchcentre.catalogue import club, stadium
from app.matchcentre.providers import teamsheets, weather
from app.matchcentre.schedule import load_schedule

ALLOWED = "http://localhost:4200"
FIXTURE = "292584"  # Benetton v Dragons, 2026-09-25 18:45 UTC at Stadio Monigo
KICKOFF = datetime(2026, 9, 25, 18, 45, tzinfo=timezone.utc)


class Upstream:
    """Fake providers behind an httpx MockTransport, counting calls per host."""

    def __init__(self, *, graphql=None, weather_hours=None, fail=(), bios_fail=False):
        self.calls: dict[str, int] = {}
        self.graphql = graphql if graphql is not None else self.published()
        self.weather_hours = weather_hours
        self.fail = set(fail)
        self.bios_fail = bios_fail
        self.bio_requests: list[dict] = []

    @staticmethod
    def bios(ids):
        # Home players only; player 3 has no known country and player 4 an unreadable date.
        return {
            "data": {
                "players": [
                    {
                        "id": i,
                        "player_data": {
                            "dob": "not a date" if i == 4 else f"1998-04-{i:02d}T12:00:00.000Z",
                            "countryOfBirth": {"name": None if i == 3 else "Italy"},
                        },
                    }
                    for i in ids
                    if i < 100
                ]
            }
        }

    @staticmethod
    def published():
        def side(prefix):
            players = [
                {
                    "id": n + (0 if prefix == "Home" else 100),
                    "name": f"{prefix} Player {n}",
                    "knownName": f"{prefix} Player {n}" if n != 8 else None,
                    "firstName": prefix,
                    "lastName": f"Player {n}",
                    "position": {
                        "id": n,
                        "name": "Prop" if n == 1 else None,
                        "shirtNumber": n,
                        "onFieldId": 1 if n <= 15 else 2,
                        "onFieldName": "Starter" if n <= 15 else "Replacement",
                    },
                }
                for n in range(1, 24)
            ]
            return {"team": {"id": 1, "name": prefix}, "players": players}

        return {
            "data": {
                "matchstats": [
                    {
                        "match_id": int(FIXTURE),
                        "match_status": "fixture",
                        "stats_data": {"id": int(FIXTURE), "homeTeam": side("Home"), "awayTeam": side("Away")},
                    }
                ]
            }
        }

    @staticmethod
    def introspection(query: str):
        def field(name, type_name, kind="OBJECT"):
            return {"name": name, "type": {"name": None, "kind": "LIST", "ofType": {"name": type_name, "kind": kind}}}

        if "__schema" in query:
            return {"data": {"__schema": {"queryType": {"fields": [field("matchstats", "MatchStats")]}}}}
        if '"MatchStats"' in query:
            return {"data": {"__type": {"fields": [field("match_id", "Int", "SCALAR"), field("stats_data", "StatsData")]}}}
        if '"StatsData"' in query:
            return {"data": {"__type": {"fields": [field("round", "Int", "SCALAR"), field("homeTeam", "TeamSide")]}}}
        if '"TeamSide"' in query:
            return {"data": {"__type": {"fields": [field("team", "Team"), field("players", "PlayerEntry")]}}}
        if '"PlayerEntry"' in query:
            return {"data": {"__type": {"fields": [field("number", "Int", "SCALAR"), field("position", "Position")]}}}
        if '"Position"' in query:
            return {"data": {"__type": {"fields": [field("name", "String", "SCALAR")]}}}
        return {"data": {"__type": None}}

    def handler(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        self.calls[host] = self.calls.get(host, 0) + 1
        if host in self.fail:
            return httpx.Response(503, json={"error": "down"})
        if host == "www.unitedrugby.com":
            body = json.loads(request.content)
            if "__schema" in body["query"] or "__type" in body["query"]:
                return httpx.Response(200, json=self.introspection(body["query"]))
            if "query Bios" in body["query"]:
                self.bio_requests.append(body["variables"])
                if self.bios_fail:
                    return httpx.Response(500, json={"errors": [{"message": "Internal server error"}]})
                return httpx.Response(200, json=self.bios(body["variables"]["ids"]))
            assert body["variables"] == {"ids": [int(FIXTURE)]}
            return httpx.Response(200, json=self.graphql)
        if host == "api.open-meteo.com":
            params = dict(request.url.params)
            assert params["latitude"] == str(stadium("Stadio Monigo").latitude)
            hours = self.weather_hours or ["2026-09-25T17:00", "2026-09-25T18:00", "2026-09-25T19:00"]
            n = len(hours)
            return httpx.Response(
                200,
                json={
                    "hourly": {
                        "time": hours,
                        "temperature_2m": [15.0 + i for i in range(n)],
                        "apparent_temperature": [14.0 + i for i in range(n)],
                        "precipitation_probability": [10 * i for i in range(n)],
                        "precipitation": [0.0] * n,
                        "wind_speed_10m": [12.0] * n,
                        "wind_gusts_10m": [30.0] * n,
                        "weather_code": [61] * n,
                        "is_day": [1, 1, 0][:n] + [0] * max(0, n - 3),
                    }
                },
            )
        raise AssertionError(f"Unexpected host {host}")


def make_client(upstream: Upstream, now: datetime, monkeypatch, **overrides) -> TestClient:
    monkeypatch.setattr(service_module, "now_utc", lambda: now)
    settings = Settings(
        _env_file=None,
        environment="test",
        ALLOWED_ORIGINS=ALLOWED,
        **overrides,
    )
    from app.main import create_app

    app = create_app(
        settings, http_transport=httpx.MockTransport(upstream.handler), snapshot_cache=MemorySnapshotCache()
    )
    return TestClient(app)


def test_unknown_fixture_is_404(monkeypatch) -> None:
    client = make_client(Upstream(), KICKOFF, monkeypatch)
    assert client.get("/v1/matches/nope").status_code == 404


def test_far_out_fixture_makes_no_provider_calls(monkeypatch) -> None:
    upstream = Upstream()
    client = make_client(upstream, KICKOFF - timedelta(days=30), monkeypatch)
    body = client.get(f"/v1/matches/{FIXTURE}").json()
    assert body["home"] == {"id": "benetton-rugby", "name": "Benetton Rugby", "shortName": "Benetton"}
    assert body["kickoffUtc"] == "2026-09-25T18:45:00Z"
    assert body["teamsheets"]["status"] == "not_published"
    assert "odds" not in body
    assert body["weather"]["status"] == "too_early"
    assert upstream.calls == {}


def test_match_week_returns_all_sections(monkeypatch) -> None:
    upstream = Upstream()
    client = make_client(upstream, KICKOFF - timedelta(days=2), monkeypatch)
    response = client.get(f"/v1/matches/{FIXTURE}")
    assert response.status_code == 200
    body = response.json()

    sheets = body["teamsheets"]
    assert sheets["status"] == "ok"
    assert len(sheets["home"]["starters"]) == 15
    assert len(sheets["home"]["replacements"]) == 8
    assert sheets["home"]["starters"][7] == {
        "number": 8,
        "name": "Home Player 8",
        "position": None,
        "captain": False,
        "starter": None,
        "dateOfBirth": "1998-04-08",
        "birthCountry": "Italy",
    }
    assert sheets["home"]["starters"][0]["position"] == "Prop"
    assert sheets["home"]["replacements"][0]["number"] == 16
    assert sheets["home"]["starters"][2]["birthCountry"] is None
    assert sheets["home"]["starters"][3]["dateOfBirth"] is None
    # Away players are missing from the bio feed.
    assert sheets["away"]["starters"][0]["dateOfBirth"] is None
    assert sheets["away"]["starters"][0]["birthCountry"] is None
    # One batched lookup for all 46 players.
    assert len(upstream.bio_requests) == 1
    assert len(upstream.bio_requests[0]["ids"]) == 46
    assert upstream.bio_requests[0]["limit"] == 46

    forecast = body["weather"]
    assert forecast["status"] == "ok"
    assert forecast["forecastHourUtc"] == "2026-09-25T19:00Z"
    assert forecast["temperatureC"] == 17.0
    assert forecast["condition"] == "Light rain"
    assert forecast["city"] == "Treviso"
    assert forecast["isDay"] is False

    client.get(f"/v1/matches/{FIXTURE}")
    assert upstream.calls == {"www.unitedrugby.com": 2, "api.open-meteo.com": 1}


def test_failed_bio_lookup_keeps_the_teamsheet(monkeypatch) -> None:
    upstream = Upstream(bios_fail=True)
    client = make_client(upstream, KICKOFF - timedelta(days=2), monkeypatch)
    sheets = client.get(f"/v1/matches/{FIXTURE}").json()["teamsheets"]
    assert sheets["status"] == "ok"
    assert len(sheets["away"]["replacements"]) == 8
    player = sheets["home"]["starters"][0]
    assert player["dateOfBirth"] is None
    assert player["birthCountry"] is None
    assert "id" not in player


def test_provider_failures_become_unavailable_without_leaking(monkeypatch) -> None:
    upstream = Upstream(fail={"www.unitedrugby.com", "api.open-meteo.com"})
    client = make_client(upstream, KICKOFF - timedelta(days=1), monkeypatch)
    response = client.get(f"/v1/matches/{FIXTURE}")
    assert response.status_code == 200
    body = response.json()
    assert {body[k]["status"] for k in ("teamsheets", "weather")} == {"unavailable"}
    assert body["weather"]["reason"] == "HTTP 503"
    assert "down" not in response.text


def test_rejected_teamsheet_query_and_unpublished_sheets(monkeypatch) -> None:
    rejected = Upstream(graphql={"errors": [{"message": "Cannot query field players"}]})
    client = make_client(rejected, KICKOFF - timedelta(days=1), monkeypatch)
    section = client.get(f"/v1/matches/{FIXTURE}").json()["teamsheets"]
    assert section["status"] == "unavailable"
    assert section["feedErrors"] == ["Cannot query field players"]
    assert section["feedFields"] == {
        "stats_data": ["round: Int", "homeTeam: TeamSide"],
        "homeTeam": ["team: Team", "players: PlayerEntry"],
        "players": ["number: Int", "position: Position"],
        "players.position": ["name: String"],
    }

    empty = Upstream.published()
    for side in ("homeTeam", "awayTeam"):
        empty["data"]["matchstats"][0]["stats_data"][side]["players"] = []
    client = make_client(Upstream(graphql=empty), KICKOFF - timedelta(days=1), monkeypatch)
    assert client.get(f"/v1/matches/{FIXTURE}").json()["teamsheets"]["status"] == "not_published"


def test_past_match_statuses(monkeypatch) -> None:
    upstream = Upstream()
    client = make_client(upstream, KICKOFF + timedelta(days=1), monkeypatch)
    body = client.get(f"/v1/matches/{FIXTURE}").json()
    assert body["weather"]["status"] == "past"
    assert body["teamsheets"]["status"] == "ok"


def test_cached_falls_back_to_stale_snapshot_on_failure() -> None:
    cache = MemorySnapshotCache()
    start = datetime(2026, 9, 20, tzinfo=timezone.utc)
    first = cached(cache, "k", lambda: Fetched("ok", {"n": 1}, timedelta(hours=1)), now=start)
    assert first.payload == {"n": 1}

    def boom() -> Fetched:
        raise httpx.ConnectError("nope")

    stale = cached(cache, "k", boom, now=start + timedelta(hours=2))
    assert stale.payload == {"n": 1} and stale.status == "ok"
    fresh = cached(cache, "k", lambda: Fetched("ok", {"n": 2}, timedelta(hours=1)), now=start + timedelta(hours=3))
    assert fresh.payload == {"n": 2}
    hit = cached(cache, "k", boom, now=start + timedelta(hours=3, minutes=30))
    assert hit.payload == {"n": 2}

    def quota() -> Fetched:
        raise ProviderError("quota")

    failed = cached(cache, "f", boom, now=start)
    assert failed.status == "unavailable" and failed.payload == {"reason": "ConnectError"}
    replaced = cached(cache, "f", quota, now=start + timedelta(minutes=6))
    assert replaced.payload == {"reason": "provider error: quota"}


def test_schedule_and_catalogues_cover_every_fixture() -> None:
    schedule = load_schedule()
    assert len(schedule.fixtures) == 151
    for fixture in schedule.fixtures:
        if fixture.home_id:
            assert club(fixture.home_id) and club(fixture.away_id)
        if fixture.venue:
            assert stadium(fixture.venue), fixture.venue


def test_weather_helpers() -> None:
    assert weather.condition(0) == "Clear sky"
    assert weather.condition(999) == "Unsettled"
    assert weather.timing_status(KICKOFF, KICKOFF - timedelta(days=8)) == "too_early"
    assert weather.timing_status(KICKOFF, KICKOFF - timedelta(days=6)) is None
    assert weather.timing_status(KICKOFF, KICKOFF + timedelta(hours=3)) == "past"


def test_teamsheet_parser_tolerates_other_shapes() -> None:
    side = teamsheets.parse_side(
        {
            "lineup": [
                {"number": 16, "name": "Bench One"},
                {"jerseyNumber": "2", "positionName": "Hooker", "captain": True, "player": {"name": "Hooker Two"}},
            ]
        }
    )
    assert side["starters"] == [
        {"id": None, "number": 2, "name": "Hooker Two", "position": "Hooker", "captain": True, "starter": None}
    ]
    assert side["replacements"][0]["name"] == "Bench One"
