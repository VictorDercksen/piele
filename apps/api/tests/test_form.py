"""Season results, form and the names glossary: the feed parser, the cached season snapshot,
the pure form builder, the bundled history, and how the chat context renders both new
sections. No network and no database."""

import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.agent.form import build_form
from app.chat import context, glossary
from app.competitions.urc_2026_27 import COMPETITION as URC
from app.config import Settings
from app.matchcentre import service as service_module
from app.matchcentre.cache import MemorySnapshotCache, ProviderError
from app.matchcentre.history import EMPTY, History, PastResult, PastSeason
from app.matchcentre.providers import results
from app.matchcentre.schedule import Fixture
from app.matchcentre.service import MatchCentreService
from tests.test_chat import facts, sources_block

SAMPLE = Path(__file__).parent / "data" / "urc-season-202601.json"
LIONS_OSPREYS = "292595"  # round 2, 2026-10-03 11:45 UTC at 10bet Ellis Park
NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
KEY = "urc-2026-27:results:season"


def sample() -> dict[str, Any]:
    return json.loads(SAMPLE.read_text())


class Feed:
    def __init__(self, body: dict[str, Any] | None = None) -> None:
        self.body = body if body is not None else sample()
        self.requests: list[dict[str, Any]] = []
        self.down = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert "query SeasonResults" in payload["query"]
        self.requests.append(payload["variables"])
        if self.down:
            return httpx.Response(503, json={"error": "down"})
        return httpx.Response(200, json=self.body)


def centre(feed: Feed, cache: MemorySnapshotCache | None = None, competition=URC) -> MatchCentreService:
    settings = Settings(_env_file=None, environment="test")
    return MatchCentreService(
        competition,
        settings,
        cache or MemorySnapshotCache(),
        lambda: httpx.Client(transport=httpx.MockTransport(feed.handler)),
    )


# The feed parser ------------------------------------------------------------------------


def test_the_parser_keeps_played_matches_with_known_teams_oldest_first() -> None:
    rows = sample()["data"]["matchstats"]
    parsed = results.parse_results(rows)
    assert len(parsed) == 8
    assert [r["fixtureId"] for r in parsed][:3] == ["292584", "292585", "292586"]
    assert parsed == sorted(parsed, key=lambda r: (r["kickoffUtc"], r["fixtureId"]))
    lions = next(r for r in parsed if r["fixtureId"] == "292587")
    assert lions == {
        "fixtureId": "292587",
        "homeSourceId": 5092,
        "awaySourceId": 5356,
        "homeScore": 27,
        "awayScore": 26,
        "kickoffUtc": "2026-09-26T11:30:00Z",
        "venue": "10bet Ellis Park",
    }
    # An unplayed fixture, a TBD play-off row and a half-filled result are skipped.
    broken = {**rows[0], "match_id": 1, "home_score": None}
    assert results.parse_results([*rows[8:], broken]) == []


def test_the_query_asks_for_the_season_and_a_limit_large_enough() -> None:
    feed = Feed()
    with httpx.Client(transport=httpx.MockTransport(feed.handler)) as client:
        fetched = results.fetch_season_results(client, "https://feed.test/graphql", "202601", NOW)
    assert feed.requests == [{"season": [202601], "limit": 400}]
    assert fetched.status == "ok" and fetched.payload["seasonId"] == "202601" and len(fetched.payload["results"]) == 8


def test_a_feed_error_is_a_provider_error() -> None:
    feed = Feed({"errors": [{"message": "Internal server error"}], "data": None})
    with httpx.Client(transport=httpx.MockTransport(feed.handler)) as client, pytest.raises(ProviderError):
        results.fetch_season_results(client, "https://feed.test/graphql", "202601", NOW)


def test_the_snapshot_lifetime_follows_the_kickoffs() -> None:
    rows = sample()["data"]["matchstats"]
    # Round 1 kicked off on 25 and 26 September; the next round is on 2 and 3 October.
    assert results.snapshot_ttl(rows, datetime(2026, 9, 26, 20, 0, tzinfo=timezone.utc)) == results.TTL_RECENT
    assert results.snapshot_ttl(rows, datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc)) == results.TTL_MAX
    assert results.snapshot_ttl(rows, datetime(2026, 10, 2, 18, 40, tzinfo=timezone.utc)) == results.TTL_MIN
    assert results.snapshot_ttl(rows, datetime(2026, 10, 2, 12, 45, tzinfo=timezone.utc)) == timedelta(hours=6)
    assert results.snapshot_ttl(rows, datetime(2026, 10, 2, 16, 0, tzinfo=timezone.utc)) == timedelta(hours=2, minutes=45)
    after_season = [{**rows[0], "match_datetime": "2026-09-25 18:45:00"}]
    assert results.snapshot_ttl(after_season, datetime(2026, 11, 1, tzinfo=timezone.utc)) == results.TTL_MAX


# The cached season snapshot ---------------------------------------------------------------


def test_season_results_map_feed_ids_to_clubs_and_drop_unknown_teams() -> None:
    body = sample()
    body["data"]["matchstats"].append(
        {**body["data"]["matchstats"][0], "match_id": 999, "home_team_id": 9999, "home_team_name": "Unknown XV"}
    )
    cache = MemorySnapshotCache()
    section = centre(Feed(body), cache).season_results(NOW)
    assert section["status"] == "ok" and section["source"] == "URC match centre"
    assert len(section["results"]) == 8
    lions = next(r for r in section["results"] if r["fixtureId"] == "292587")
    assert lions == {
        "fixtureId": "292587",
        "homeId": "10bet-lions",
        "awayId": "leinster-rugby",
        "homeScore": 27,
        "awayScore": 26,
        "kickoffUtc": "2026-09-26T11:30:00Z",
        "venue": "10bet Ellis Park",
    }
    # One snapshot per competition, stored in feed ids.
    stored = cache.get(KEY)
    assert stored is not None
    assert next(r for r in stored.payload["results"] if r["fixtureId"] == "292587")["homeSourceId"] == 5092
    assert 9999 in [r["homeSourceId"] for r in stored.payload["results"]]


def test_season_results_are_cached_until_the_snapshot_expires() -> None:
    feed, cache = Feed(), MemorySnapshotCache()
    service = centre(feed, cache)
    service.season_results(NOW)
    service.season_results(NOW + timedelta(minutes=5))
    assert len(feed.requests) == 1
    service.season_results(NOW + timedelta(hours=7))
    assert len(feed.requests) == 2


def test_a_failure_is_unavailable_for_ten_minutes_and_keeps_the_last_good_data() -> None:
    feed, cache = Feed(), MemorySnapshotCache()
    feed.down = True
    service = centre(feed, cache)
    section = service.season_results(NOW)
    assert section["status"] == "unavailable" and section["reason"] == "HTTP 503" and "results" not in section
    service.season_results(NOW + timedelta(minutes=9))
    assert len(feed.requests) == 1  # not retried inside the failure TTL
    feed.down = False
    assert service.season_results(NOW + timedelta(minutes=11))["status"] == "ok"
    assert len(feed.requests) == 2
    # A later outage serves the stale results until the feed answers again.
    feed.down = True
    stale = service.season_results(NOW + timedelta(days=2))
    assert stale["status"] == "ok" and len(stale["results"]) == 8


def test_a_competition_without_a_results_feed_is_unavailable() -> None:
    bare = replace(URC, season_results=None, feed_season_id=None, history_file=None)
    feed = Feed()
    section = centre(feed, competition=bare).season_results(NOW)
    assert section["status"] == "unavailable" and feed.requests == []
    assert bare.history() is EMPTY and bare.history().seasons == ()


# The bundled history ----------------------------------------------------------------------


def test_the_bundled_history_covers_five_seasons_with_catalogue_clubs() -> None:
    history = URC.history()
    assert [s.season_id for s in history.seasons] == ["202101", "202201", "202301", "202401", "202501"]
    assert [s.label for s in history.seasons] == ["2021/22", "2022/23", "2023/24", "2024/25", "2025/26"]
    ids = {club.id for club in URC.clubs}
    matches = [r for s in history.seasons for r in s.results]
    assert len(matches) > 700 and len({r.match_id for r in matches}) == len(matches)
    assert {r.home_id for r in matches} | {r.away_id for r in matches} <= ids
    for season in history.seasons:
        assert list(season.results) == sorted(season.results, key=lambda r: (r.kickoff_utc, r.match_id))
    last = history.seasons[-1].results[-1]
    assert (last.home_id, last.away_id, last.home_score, last.away_score) == ("leinster-rugby", "vodacom-bulls", 36, 7)
    assert set(history.club_names) <= ids and history.club_names["10bet-lions"]


# The form builder -----------------------------------------------------------------------


def past(match_id: str, home: str, away: str, score: tuple[int, int], day: datetime) -> PastResult:
    return PastResult(match_id, home, away, score[0], score[1], day, "Somewhere")


LIONS, OSPREYS, LEINSTER = "10bet-lions", "ospreys", "leinster-rugby"
HISTORY = History(
    "test",
    "2026-10-01",
    (
        PastSeason(
            "202401",
            "2024/25",
            (
                past("1", LIONS, OSPREYS, (29, 28), datetime(2025, 5, 17, 15, tzinfo=timezone.utc)),
                past("2", LEINSTER, LIONS, (30, 30), datetime(2025, 5, 24, 15, tzinfo=timezone.utc)),
            ),
        ),
        PastSeason(
            "202501",
            "2025/26",
            (
                past("3", OSPREYS, LIONS, (24, 24), datetime(2026, 1, 23, 19, 45, tzinfo=timezone.utc)),
                past("4", LIONS, LEINSTER, (10, 20), datetime(2026, 5, 2, 15, tzinfo=timezone.utc)),
            ),
        ),
    ),
    {},
)
TARGET = URC.schedule().fixture(LIONS_OSPREYS)


def row(match_id: str, home: str, away: str, score: tuple[int, int], kickoff: str) -> dict[str, Any]:
    return {"fixtureId": match_id, "homeId": home, "awayId": away, "homeScore": score[0], "awayScore": score[1], "kickoffUtc": kickoff, "venue": "Ground"}


CURRENT = {
    "status": "ok",
    "results": [
        row("a", LIONS, LEINSTER, (27, 26), "2026-09-26T11:30:00Z"),
        row("b", "hollywoodbets-sharks", OSPREYS, (41, 24), "2026-09-26T14:00:00Z"),
        # At or after the fixture's kickoff: never counted.
        row("c", LIONS, OSPREYS, (99, 0), "2026-10-03T11:45:00Z"),
        row("d", OSPREYS, LIONS, (0, 99), "2026-10-04T11:45:00Z"),
    ],
}


def test_form_orders_current_season_then_history_most_recent_first() -> None:
    form = build_form(URC, TARGET, CURRENT, HISTORY)
    assert form["status"] == "ok" and "currentSeason" not in form
    lions = form["home"]["recent"]
    assert [(r["season"], r["opponent"], r["outcome"]) for r in lions] == [
        ("2026/27", "Leinster Rugby", "won"),
        ("2025/26", "Leinster Rugby", "lost"),
        ("2025/26", "Ospreys", "drawn"),
        ("2024/25", "Leinster Rugby", "drawn"),
        ("2024/25", "Ospreys", "won"),
    ]
    assert lions[0] == {
        "kickoffUtc": datetime(2026, 9, 26, 11, 30, tzinfo=timezone.utc),
        "season": "2026/27",
        "opponentId": LEINSTER,
        "opponent": "Leinster Rugby",
        "atHome": True,
        "for": 27,
        "against": 26,
        "outcome": "won",
        "venue": "Ground",
    }
    assert lions[1]["atHome"] is True and (lions[1]["for"], lions[1]["against"]) == (10, 20)
    assert build_form(URC, TARGET, CURRENT, HISTORY, limit=2)["home"]["recent"] == lions[:2]


def test_form_leaves_out_matches_at_or_after_the_fixtures_kickoff() -> None:
    form = build_form(URC, TARGET, CURRENT, HISTORY)
    scores = {score for side in ("home", "away") for r in form[side]["recent"] for score in (r["for"], r["against"])}
    assert 99 not in scores
    assert all(m["homeScore"] != 99 and m["awayScore"] != 99 for m in form["headToHead"])
    # The same results seen from a later fixture do count.
    later = Fixture("x", 3, LIONS, OSPREYS, datetime(2026, 10, 5, tzinfo=timezone.utc), None)
    assert build_form(URC, later, CURRENT, HISTORY)["home"]["recent"][0]["for"] == 99  # Ospreys 0-99 Lions


def test_the_season_record_counts_this_season_only() -> None:
    form = build_form(URC, TARGET, CURRENT, HISTORY)
    assert form["home"]["season"] == {"played": 1, "won": 1, "drawn": 0, "lost": 0, "pointsFor": 27, "pointsAgainst": 26}
    assert form["away"]["season"] == {"played": 1, "won": 0, "drawn": 0, "lost": 1, "pointsFor": 24, "pointsAgainst": 41}
    # No results yet this season: an empty record, not unavailable.
    empty = build_form(URC, TARGET, {"status": "ok", "results": []}, HISTORY)
    assert empty["home"]["season"] == {"played": 0, "won": 0, "drawn": 0, "lost": 0, "pointsFor": 0, "pointsAgainst": 0}


def test_head_to_head_spans_seasons_and_keeps_the_last_five() -> None:
    form = build_form(URC, TARGET, CURRENT, HISTORY)
    assert [(m["season"], m["home"], m["homeScore"], m["away"], m["awayScore"]) for m in form["headToHead"]] == [
        ("2025/26", "Ospreys", 24, "Lions", 24),
        ("2024/25", "Lions", 29, "Ospreys", 28),
    ]
    many = History(
        "t", "t", (PastSeason("1", "2000/01", tuple(past(str(i), LIONS, OSPREYS, (i, 0), datetime(2000 + i, 1, 1, tzinfo=timezone.utc)) for i in range(1, 9))),), {}
    )
    meetings = build_form(URC, TARGET, {"status": "ok", "results": []}, many)["headToHead"]
    assert [m["homeScore"] for m in meetings] == [8, 7, 6, 5, 4]


def test_form_without_the_current_season_still_uses_history() -> None:
    form = build_form(URC, TARGET, {"status": "unavailable", "reason": "HTTP 503"}, HISTORY)
    assert form["status"] == "ok" and form["currentSeason"] == "unavailable"
    assert form["home"]["season"] is None and form["away"]["season"] is None
    assert form["home"]["recent"][0]["season"] == "2025/26"
    assert len(form["headToHead"]) == 2
    nothing = build_form(URC, TARGET, None, EMPTY)
    assert nothing["status"] == "unavailable"


# The context sections -----------------------------------------------------------------------


def lions_ospreys_facts(**overrides: Any) -> dict[str, Any]:
    fixture = URC.schedule().fixture(LIONS_OSPREYS)
    home, away = URC.club(fixture.home_id), URC.club(fixture.away_id)
    form = build_form(URC, fixture, centre(Feed()).season_results(NOW), URC.history())
    return facts(
        now=NOW,
        competition=URC.name,
        fixture={
            "id": LIONS_OSPREYS,
            "round": 2,
            "roundLabel": "Round 02",
            "home": home.name,
            "away": away.name,
            "kickoffUtc": fixture.kickoff_utc,
            "venue": fixture.venue,
            "city": "Johannesburg",
            "country": "South Africa",
        },
        names={"clubs": [{"name": c.name, "otherNames": glossary.club_aliases(URC, c)} for c in (home, away)]},
        **{"form": form, **overrides},
    )


def section(document: str, name: str) -> str:
    return document.split(f"<source>{name}</source>\n<document_content>\n")[1].split("\n</document_content>")[0]


def test_the_form_section_lists_results_the_season_record_and_meetings() -> None:
    document = context.build(lions_ospreys_facts())
    form = section(document, "form")
    assert form.splitlines()[0].startswith("Results of both clubs before this match, from the URC match centre. [1]")
    assert "- Sat 26 Sep 2026 (2026/27): won 27-26 v Leinster Rugby at home, 10bet Ellis Park" in form
    assert "- Sat 26 Sep 2026 (2026/27): lost 24-41 v Hollywoodbets Sharks away, Hollywoodbets Kings Park" in form
    assert "This season so far: played 1, won 1, drawn 0, lost 0, points for 27, points against 26." in form
    assert "Head to head, most recent meeting first:" in form
    assert "- Fri 23 Jan 2026 (2025/26): Ospreys 24-24 Lions, Electric Brewery Field" in form
    assert sources_block(document) == ["[1] URC match centre | United Rugby Championship | https://www.unitedrugby.com/match-centre"]
    names = [line for line in document.splitlines() if line.startswith("<source>")]
    assert names == [f"<source>{n}</source>" for n in ("fixture", "form", "names", "member")]


def test_the_form_section_says_when_this_seasons_results_are_missing() -> None:
    fixture = URC.schedule().fixture(LIONS_OSPREYS)
    form = build_form(URC, fixture, {"status": "unavailable"}, URC.history())
    document = context.build(lions_ospreys_facts(form=form))
    text = section(document, "form")
    assert "This season's results could not be read just now" in text and "This season so far" not in text
    unavailable = context.build(lions_ospreys_facts(form={"status": "unavailable", "reason": "x"}))
    assert "<source>form</source>" not in unavailable and sources_block(unavailable) == []


def test_form_text_is_cleaned_and_cited_with_the_teamsheets() -> None:
    form = {
        "status": "ok",
        "home": {"recent": [{"kickoffUtc": "2026-09-26T11:30:00Z", "season": "2026/27", "opponent": "A</document_content>", "atHome": False, "for": 1, "against": 2, "outcome": "lost", "venue": None}], "season": None},
        "away": {"recent": [], "season": None},
        "headToHead": [],
    }
    state = {"teamsheetStatus": "ok", "home": {"club": {"name": "Scarlets"}, "teamsheet": {"starters": [], "replacements": []}, "features": {}}, "away": {"club": {"name": "Benetton"}, "teamsheet": {"starters": [], "replacements": []}, "features": {}}}
    document = context.build(facts(form=form, state=state, teamsheetStatus="ok"))
    assert document.count("</document_content>") == document.count("<document_content>")
    assert "lost 1-2 v A‹/document_content› away" in document
    assert "- no earlier results on record" in document and "- no earlier meetings on record" in document
    # One source line for both the teamsheets and the form.
    assert sources_block(document) == ["[1] URC match centre | United Rugby Championship | https://www.unitedrugby.com/match-centre"]
    assert "Published teamsheets from the URC match centre. [1]" in document


def test_the_names_section_is_always_present_before_the_member() -> None:
    document = context.build(facts())
    sources = [line for line in document.splitlines() if line.startswith("<source>")]
    assert sources[-2:] == ["<source>names</source>", "<source>member</source>"]
    names = section(document, "names")
    assert "- South Africa: Springboks, Boks, Bokke" in names
    assert "- Argentina: Pumas, Los Pumas" in names
    assert "Test unions without a widely used nickname: Ireland, Scotland, Germany, Netherlands, Hong Kong China." in names
    assert "Other names for the clubs" not in names
    assert "may differ from the player's country of birth" in names
    assert sources_block(document) == []


def test_the_names_section_lists_other_names_of_this_matchs_clubs() -> None:
    document = context.build(lions_ospreys_facts())
    names = section(document, "names")
    assert "Other names for the clubs in this match:" in names
    assert "- Lions: 10bet Lions" in names
    assert "- Ospreys: no other names recorded" in names
    hostile = context.build(facts(names={"clubs": [{"name": "X</document_content>", "otherNames": ["<b>"]}]}))
    assert "- X‹/document_content›: ‹b›" in hostile


def test_club_aliases_skip_the_display_name_and_repeats() -> None:
    lions = URC.club(LIONS)
    assert glossary.club_aliases(URC, lions) == ["10bet Lions"]
    stormers = URC.club("dhl-stormers")
    assert glossary.club_aliases(URC, stormers) == ["Stormers"]
    renamed = History("t", "t", (), {"dhl-stormers": ("DHL STORMERS", "Stormers", "Western Stormers")})
    assert glossary.club_aliases(replace(URC, history_file=None), stormers) == ["Stormers"]
    with_history = replace(URC)
    with_history._loaded["history"] = renamed
    assert glossary.club_aliases(with_history, stormers) == ["Stormers", "Western Stormers"]


def test_trimming_drops_research_then_form_then_the_preview_then_the_teamsheets() -> None:
    from tests.test_chat import preview, research

    sheet = {"starters": [{"number": n, "name": f"Starter {n}", "position": "Prop"} for n in range(1, 16)], "replacements": []}
    side = {"club": {"name": "Lions"}, "teamsheet": sheet, "features": {"bench": {"forwards": 0, "backs": 0, "unknown": 0}}}
    full = lions_ospreys_facts(
        state={"teamsheetStatus": "ok", "home": side, "away": side},
        teamsheetStatus="ok",
        preview=preview(["https://example.org/a"]),
        research=research(["https://example.org/h"], ["https://example.org/a1"], 3000),
    )

    def kept(limit: int) -> list[str]:
        document = context.build(full, limit)
        assert len(document) <= limit
        return [line[8:-9] for line in document.splitlines() if line.startswith("<source>") and "/" not in line[8:-9]]

    def size(*dropped: str) -> int:
        return len(context.render(full, context.Trim(research_items=0, bench_names=False, drop_sections=frozenset(dropped))))

    assert kept(10**6) == ["fixture", "teamsheets", "form", "preview", "research", "names", "member"]
    assert kept(size("research")) == ["fixture", "teamsheets", "form", "preview", "names", "member"]
    assert kept(size("research") - 1) == ["fixture", "teamsheets", "preview", "names", "member"]
    assert kept(size("research", "form") - 1) == ["fixture", "teamsheets", "names", "member"]
    assert kept(size("research", "form", "preview") - 1) == ["fixture", "names", "member"]


# The chat's provider read ----------------------------------------------------------------------


def chat_turn(fixture_id: str = LIONS_OSPREYS):
    from app.chat import limits
    from app.chat.service import Turn

    fixture = URC.schedule().fixture(fixture_id)
    base = lions_ospreys_facts()
    base.pop("now"), base.pop("form")
    return Turn("req", None, None, None, None, URC, fixture, "q", [], limits.Remaining(1, 1), base)  # type: ignore[arg-type]


def agent_centre(feed) -> MatchCentreService:
    settings = Settings(_env_file=None, environment="test")
    return MatchCentreService(URC, settings, MemorySnapshotCache(), lambda: httpx.Client(transport=httpx.MockTransport(feed.handler)))


def test_gather_adds_the_form_even_when_the_teamsheets_are_not_out(monkeypatch) -> None:
    from app.chat import service as chat_service
    from tests.test_agent import Feed as AgentFeed

    feed = AgentFeed()
    monkeypatch.setattr(chat_service, "now", lambda: NOW - timedelta(days=10))
    document = chat_service.gather(agent_centre(feed), chat_turn())
    assert "The teamsheets are not published yet." in document
    assert "<source>form</source>" in document and "won 27-26 v Leinster Rugby at home" in document
    assert feed.results_requests == 1


def test_gather_survives_a_failing_season_feed_and_a_failing_form(monkeypatch, caplog) -> None:
    from app.chat import service as chat_service
    from tests.test_agent import Feed as AgentFeed

    monkeypatch.setattr(chat_service, "now", lambda: NOW - timedelta(days=10))
    feed = AgentFeed()
    feed.results_down = True
    document = chat_service.gather(agent_centre(feed), chat_turn())
    assert "This season's results could not be read just now" in document and "Ospreys 24-24 Lions" in document

    def broken(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("secret detail")

    monkeypatch.setattr(chat_service, "build_form", broken)
    with caplog.at_level("WARNING"):
        document = chat_service.gather(agent_centre(AgentFeed()), chat_turn())
    assert "<source>form</source>" not in document and "<source>names</source>" in document
    assert "form failed: RuntimeError" in caplog.text and "secret detail" not in caplog.text


def test_the_history_script_maps_ids_reports_dropped_rows_and_collects_names() -> None:
    import importlib.util

    path = Path(__file__).resolve().parents[1] / "scripts" / "import_urc_history.py"
    spec = importlib.util.spec_from_file_location("import_urc_history", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    rows = sample()["data"]["matchstats"][:8]
    rows.append({**rows[0], "match_id": 5, "home_team_id": 9999, "home_team_name": "Southern Kings"})
    names: dict[str, list[str]] = {}
    season, dropped = module.build_season(2025, rows, names)
    assert (season["seasonId"], season["label"], len(season["results"])) == ("202501", "2025/26", 8)
    assert dropped == ["Southern Kings 19-19 Dragons RFC (2026-09-25)"]
    assert season["results"][0]["homeId"] == "benetton-rugby" and "homeSourceId" not in season["results"][0]
    assert names["10bet-lions"] == ["10bet Lions"]
    assert (module.season_id(2021), module.season_label(2025), module.season_label(2099)) == ("202101", "2025/26", "2099/00")
