import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.matchcentre import service as service_module
from app.matchcentre.cache import Fetched, MemorySnapshotCache, cached
from app.matchcentre.catalogue import club, stadium
from app.matchcentre.providers import teamsheets, weather
from app.matchcentre.schedule import load_schedule

ALLOWED = "http://localhost:4200"
FIXTURE = "292584"  # Benetton v Dragons, 2026-09-25 18:45 UTC at Stadio Monigo
KICKOFF = datetime(2026, 9, 25, 18, 45, tzinfo=timezone.utc)


class Upstream:
    """Fake providers behind an httpx MockTransport, counting calls per host."""

    def __init__(self, *, odds_events=None, graphql=None, weather_hours=None, fail=()):
        self.calls: dict[str, int] = {}
        self.odds_events = odds_events if odds_events is not None else [self.event()]
        self.graphql = graphql if graphql is not None else self.published()
        self.weather_hours = weather_hours
        self.fail = set(fail)

    @staticmethod
    def event():
        return {
            "id": "e1",
            "commence_time": "2026-09-25T18:45:00Z",
            "home_team": "Benetton Treviso",
            "away_team": "Dragons",
            "bookmakers": [
                {
                    "key": "old",
                    "title": "Old Book",
                    "last_update": "2026-09-20T10:00:00Z",
                    "markets": [
                        {
                            "key": "h2h",
                            "outcomes": [
                                {"name": "Benetton Treviso", "price": 1.4},
                                {"name": "Dragons", "price": 3.0},
                                {"name": "Draw", "price": 21.0},
                            ],
                        }
                    ],
                },
                {
                    "key": "fresh",
                    "title": "Fresh Book",
                    "last_update": "2026-09-21T10:00:00Z",
                    "markets": [
                        {
                            "key": "h2h",
                            "outcomes": [
                                {"name": "Benetton Treviso", "price": 1.5},
                                {"name": "Dragons", "price": 2.6},
                                {"name": "Draw", "price": 20.0},
                            ],
                        },
                        {
                            "key": "spreads",
                            "outcomes": [
                                {"name": "Benetton Treviso", "price": 1.9, "point": -6.5},
                                {"name": "Dragons", "price": 1.9, "point": 6.5},
                            ],
                        },
                    ],
                },
            ],
        }

    @staticmethod
    def published():
        def side(prefix):
            players = [
                {
                    "shirtNumber": n,
                    "position": "Prop" if n == 1 else None,
                    "isCaptain": n == 8,
                    "isStarter": n <= 15,
                    "player": {"id": n, "firstName": prefix, "lastName": f"Player {n}"},
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

    def handler(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        self.calls[host] = self.calls.get(host, 0) + 1
        if host in self.fail:
            return httpx.Response(503, json={"error": "down"})
        if host == "api.the-odds-api.com":
            if request.url.path.endswith("/sports/"):
                assert "apiKey" in dict(request.url.params)
                return httpx.Response(
                    200,
                    json=[
                        {"key": "rugbyleague_nrl", "group": "Rugby League", "title": "NRL", "active": True},
                        {
                            "key": "rugbyunion_urc",
                            "group": "Rugby Union",
                            "title": "United Rugby Championship",
                            "active": True,
                        },
                    ],
                )
            assert "rugbyunion_urc" in request.url.path
            assert dict(request.url.params)["markets"] == "h2h,spreads"
            return httpx.Response(200, json=self.odds_events, headers={"x-requests-remaining": "480"})
        if host == "www.unitedrugby.com":
            body = json.loads(request.content)
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
        **{"odds_api_key": "test-key", **overrides},
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
    assert body["odds"]["status"] == "too_early"
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
        "captain": True,
        "starter": True,
    }

    odds = body["odds"]
    assert odds["status"] == "ok"
    assert odds["bookmaker"] == "Fresh Book"
    assert (odds["home"], odds["draw"], odds["away"]) == (1.5, 20.0, 2.6)
    assert odds["handicap"] == {"home": {"line": -6.5, "price": 1.9}, "away": {"line": 6.5, "price": 1.9}}
    assert odds["bookmakerCount"] == 2
    assert "events" not in odds and "test-key" not in response.text

    forecast = body["weather"]
    assert forecast["status"] == "ok"
    assert forecast["forecastHourUtc"] == "2026-09-25T19:00Z"
    assert forecast["temperatureC"] == 17.0
    assert forecast["condition"] == "Light rain"
    assert forecast["city"] == "Treviso"

    client.get(f"/v1/matches/{FIXTURE}")
    assert upstream.calls == {"api.the-odds-api.com": 2, "www.unitedrugby.com": 1, "api.open-meteo.com": 1}


def test_odds_without_key_and_without_coverage(monkeypatch) -> None:
    client = make_client(Upstream(), KICKOFF - timedelta(days=2), monkeypatch, odds_api_key=None)
    assert client.get(f"/v1/matches/{FIXTURE}").json()["odds"]["status"] == "unavailable"

    other = Upstream(odds_events=[{**Upstream.event(), "home_team": "Leinster", "away_team": "Munster"}])
    client = make_client(other, KICKOFF - timedelta(days=2), monkeypatch)
    assert client.get(f"/v1/matches/{FIXTURE}").json()["odds"]["status"] == "not_covered"


def test_provider_failures_become_unavailable_without_leaking(monkeypatch) -> None:
    upstream = Upstream(fail={"www.unitedrugby.com", "api.open-meteo.com", "api.the-odds-api.com"})
    client = make_client(upstream, KICKOFF - timedelta(days=1), monkeypatch)
    response = client.get(f"/v1/matches/{FIXTURE}")
    assert response.status_code == 200
    body = response.json()
    assert {body[k]["status"] for k in ("teamsheets", "odds", "weather")} == {"unavailable"}
    assert "503" not in response.text and "down" not in response.text


def test_rejected_teamsheet_query_and_unpublished_sheets(monkeypatch) -> None:
    rejected = Upstream(graphql={"errors": [{"message": "Cannot query field players"}]})
    client = make_client(rejected, KICKOFF - timedelta(days=1), monkeypatch)
    assert client.get(f"/v1/matches/{FIXTURE}").json()["teamsheets"]["status"] == "unavailable"

    empty = Upstream.published()
    for side in ("homeTeam", "awayTeam"):
        empty["data"]["matchstats"][0]["stats_data"][side]["players"] = []
    client = make_client(Upstream(graphql=empty), KICKOFF - timedelta(days=1), monkeypatch)
    assert client.get(f"/v1/matches/{FIXTURE}").json()["teamsheets"]["status"] == "not_published"


def test_past_match_statuses(monkeypatch) -> None:
    upstream = Upstream()
    client = make_client(upstream, KICKOFF + timedelta(days=1), monkeypatch)
    body = client.get(f"/v1/matches/{FIXTURE}").json()
    assert body["odds"]["status"] == "past"
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


def test_schedule_and_catalogues_cover_every_fixture() -> None:
    schedule = load_schedule()
    assert len(schedule.fixtures) == 151
    for fixture in schedule.fixtures:
        if fixture.home_id:
            assert club(fixture.home_id) and club(fixture.away_id)
        if fixture.venue:
            assert stadium(fixture.venue), fixture.venue
    assert club("dhl-stormers").matches("DHL Stormers")
    assert club("10bet-lions").matches("Emirates Lions")
    assert not club("leinster-rugby").matches("Lions")


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
        {"number": 2, "name": "Hooker Two", "position": "Hooker", "captain": True, "starter": None}
    ]
    assert side["replacements"][0]["name"] == "Bench One"


@pytest.mark.parametrize("value", ["", None])
def test_blank_key_counts_as_unset(monkeypatch, value) -> None:
    client = make_client(Upstream(), KICKOFF - timedelta(days=2), monkeypatch, odds_api_key=value)
    assert client.get(f"/v1/matches/{FIXTURE}").json()["odds"]["status"] == "unavailable"
