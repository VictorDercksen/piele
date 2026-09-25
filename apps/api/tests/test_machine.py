"""The Machine's inputs and outputs: the kickoff guard and form in the fixture state, the Jev
request, pick derivation and Superbru scoring."""

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.agent import jev
from app.agent.pick import outcome_probabilities, pick
from app.agent.scoring import SUPERBRU, Pick, fixture_points, grand_slam
from app.agent.state import BeforeKickoff, LeakError, Result, build_state, standings
from app.matchcentre.schedule import Fixture

KICKOFF = datetime(2024, 10, 5, 16, 0, tzinfo=timezone.utc)
WEEK = timedelta(days=7)
TARGET = Fixture("3", 3, "leinster-rugby", "munster-rugby", KICKOFF, "Aviva Stadium")
EARLIER = Fixture("2", 2, "munster-rugby", "leinster-rugby", KICKOFF - WEEK, "Thomond Park")
LATER = Fixture("4", 4, "leinster-rugby", "ulster-rugby", KICKOFF + WEEK, "Aviva Stadium")


def dist(**probabilities: float) -> dict[str, float]:
    return {key: probabilities.get(key, 0.0) for key in jev.BAND_KEYS}


def result(fixture: Fixture, home: int, away: int, tries: tuple[int, int] | None = None) -> Result:
    assert fixture.kickoff_utc and fixture.home_id and fixture.away_id
    home_tries, away_tries = tries or (None, None)
    return Result(fixture.id, fixture.kickoff_utc, fixture.home_id, fixture.away_id, home, away, home_tries, away_tries)


def sheet(prefix: str) -> dict:
    players = [{"number": n, "name": f"{prefix} {n}", "position": "hooker" if n == 2 else f"sub {n - 15}"} for n in range(1, 24)]
    return {"starters": players[:15], "replacements": players[15:]}


class Source:
    """Every fixture, teamsheet and result, with no regard for kickoff."""

    def __init__(self, results: list[Result]) -> None:
        self._results = results

    def fixtures(self):
        return [EARLIER, TARGET, LATER]

    def teamsheets(self, fixture):
        home, away = ("Leinster", "Munster") if fixture.home_id == "leinster-rugby" else ("Munster", "Leinster")
        return {"status": "ok", "home": sheet(home), "away": sheet(away)}

    def weather(self, fixture):
        return {"status": "ok", "condition": "Light rain", "temperatureC": 11.4, "windKmh": 23.6, "gustKmh": None}

    def results(self, before):
        return [r for r in self._results if r.kickoff_utc < before]


# Kickoff guard ------------------------------------------------------------------------


def test_the_guard_refuses_anything_from_kickoff_onward() -> None:
    guard = BeforeKickoff(Source([]), TARGET)
    assert [f.id for f in guard.fixtures()] == ["2", "3"]
    assert guard.teamsheets(TARGET)["status"] == "ok"
    assert guard.teamsheets(EARLIER)["status"] == "ok"
    with pytest.raises(LeakError):
        guard.teamsheets(LATER)
    with pytest.raises(LeakError):
        guard.weather(EARLIER)
    with pytest.raises(LeakError):
        guard.results(KICKOFF + timedelta(minutes=1))


def test_a_source_that_returns_later_results_fails_the_state() -> None:
    class Leaky(Source):
        def results(self, before):
            return self._results

    leaky = Leaky([result(EARLIER, 20, 10), result(TARGET, 30, 3)])
    with pytest.raises(LeakError):
        build_state(TARGET, leaky, KICKOFF - timedelta(hours=1))


def test_state_form_uses_only_earlier_results() -> None:
    source = Source([result(EARLIER, 20, 17, (2, 3)), result(TARGET, 30, 3)])
    state = build_state(TARGET, source, KICKOFF - timedelta(hours=1))
    home = state["form"]["home"]
    assert state["form"]["status"] == "ok"
    assert home["recent"][0] == {
        "fixtureId": "2", "atHome": False, "opponentId": "munster-rugby", "opponentName": "Munster Rugby",
        "for": 17, "against": 20, "tries": 3, "result": "lost",
    }
    assert home["season"]["tablePoints"] == 1 and home["season"]["position"] == 2
    assert state["form"]["away"]["season"]["tablePoints"] == 4


def test_standings_award_try_and_losing_bonuses_and_skip_playoffs() -> None:
    playoff = Result("9", KICKOFF, "leinster-rugby", "munster-rugby", 50, 0, 7, 0, table=False)
    table = standings([result(EARLIER, 24, 28, (4, 4)), playoff])
    by_team = {row["teamId"]: row for row in table}
    assert by_team["leinster-rugby"]["tablePoints"] == 5  # win and try bonus
    assert by_team["munster-rugby"]["tablePoints"] == 2  # try bonus and losing bonus
    assert by_team["leinster-rugby"]["played"] == 1
    assert [row["position"] for row in table] == [1, 2]


# Jev request --------------------------------------------------------------------------


def test_the_request_has_the_fixed_question_and_no_dates_or_hashes() -> None:
    state = build_state(TARGET, Source([result(EARLIER, 17, 20)]), KICKOFF - timedelta(hours=1))
    request = jev.build_request(state)
    encoded = json.dumps(request)

    assert request["model"] == "jev-latest"
    assert list(request["questions"]) == ["result_band"]
    criteria = request["questions"]["result_band"]["criteria"]
    assert list(criteria) == list(jev.BAND_KEYS) and len(criteria) == 13
    assert criteria["home_31_plus"] == "`home` wins by 31 points or more"
    assert "2024" not in encoded and "Hash" not in encoded and "Utc" not in encoded

    home = request["state"]["home"]
    assert home["club"] == "Leinster Rugby" and home["travel"] == "playing at home"
    assert home["form"]["recentResults"] == ["won 20-17 away against Munster Rugby"]
    assert home["form"]["tablePosition"] == "1st of 2"
    assert home["lineup"]["startingXV"][1] == "2 Leinster 2, hooker"
    assert home["lineup"]["replacements"][0] == "16 Leinster 16"
    assert request["state"]["match"]["kickoffForecast"] == {"conditions": "Light rain", "temperatureC": 11, "windKmh": 24}
    assert jev.request_hash(request) == jev.request_hash(json.loads(encoded))


def test_bands_cover_every_margin() -> None:
    assert jev.band_for(22, 17) == "home_1_5"
    assert jev.band_for(17, 23) == "away_6_10"
    assert jev.band_for(20, 20) == "draw"
    assert jev.band_for(30, 9) == "home_21_30"
    assert jev.band_for(10, 41) == "away_31_plus"


def test_distribution_is_validated_and_normalised() -> None:
    answer = {"type": "choice", "choice": "home_1_5", "probabilities": dist(home_1_5=0.51, away_1_5=0.5)}
    parsed = jev.distribution({"answers": {"result_band": answer}})
    assert parsed["home_1_5"] == pytest.approx(0.51 / 1.01)
    with pytest.raises(ValueError):
        jev.normalise(dist(home_1_5=0.5, away_1_5=0.4))
    with pytest.raises(ValueError):
        jev.normalise({"home_1_5": 1.0})
    with pytest.raises(ValueError):
        jev.distribution({"answers": {}})


def test_ask_sends_the_key_and_retries_rate_limits(monkeypatch) -> None:
    monkeypatch.setattr(jev.time, "sleep", lambda seconds: None)
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.headers["Authorization"])
        if len(calls) == 1:
            return httpx.Response(429, headers={"retry-after": "1"})
        return httpx.Response(200, json={"model": "jev-1.13.0", "answers": {}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert jev.ask(client, {"model": "jev-latest"}, "key")["model"] == "jev-1.13.0"
    assert calls == ["Bearer key", "Bearer key"]


# Pick ---------------------------------------------------------------------------------


def test_pick_takes_the_likeliest_side_and_the_best_margin_window() -> None:
    d = dist(home_1_5=0.3, home_6_10=0.3, draw=0.05, away_1_5=0.2, away_6_10=0.15)
    assert outcome_probabilities(d) == pytest.approx({"home": 0.6, "draw": 0.05, "away": 0.35})
    # Home 5 covers 0 to 10: 0.05 + 10 x 0.06. Home 4 covers -1 to 9: 0.04 + 0.05 + 9 x 0.06.
    assert pick(d) == Pick("home", 5)


def test_pick_spreads_the_open_band_and_breaks_ties_low() -> None:
    # Away 36 to 40 each cover 11 of the 15 margins from 31 to 45.
    assert pick(dist(away_31_plus=1.0)) == Pick("away", 36)


def test_pick_can_be_a_draw_and_side_ties_go_home() -> None:
    assert pick(dist(draw=0.4, home_1_5=0.3, away_1_5=0.3)) == Pick("draw", 0)
    # Home 1 covers -4 to 6: 0.5 + 4 x 0.1; home 2 covers -3 to 7: 0.5 + 3 x 0.1.
    assert pick(dist(home_1_5=0.5, away_1_5=0.5)) == Pick("home", 1)


# Scoring ------------------------------------------------------------------------------


def test_fixture_points() -> None:
    assert fixture_points(Pick("home", 5), 22, 17).total == 1.5
    wrong_but_close = fixture_points(Pick("home", 3), 17, 19)
    assert (wrong_but_close.win, wrong_but_close.margin) == (0.0, 0.5)
    assert fixture_points(Pick("draw", 0), 20, 20).total == 1.5
    right_but_far = fixture_points(Pick("home", 10), 26, 10)
    assert (right_but_far.correct_outcome, right_but_far.total) == (True, 1.0)


def test_grand_slam_needs_every_outcome_in_a_full_round() -> None:
    assert grand_slam([True] * 8)
    assert not grand_slam([True] * 7 + [False])
    assert not grand_slam([True] * (SUPERBRU.grand_slam_min_matches - 1))
