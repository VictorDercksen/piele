"""Superbru picks and rules without a database: pick validation, rules merging and
validation, and where a fixture's result comes from. The routes are covered in
tests/test_league.py, which needs PIELE_TEST_DATABASE_URL."""

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app import competitions
from app.league import service

URC = competitions.get("urc-2026-27")


def code(call) -> str:
    with pytest.raises(HTTPException) as caught:
        call()
    return caught.value.detail["code"]


def test_picks_are_signed_from_the_home_side() -> None:
    assert service.check_pick("home", 7) == ("home", 7, False)
    assert service.check_pick("away", 150, is_default=True) == ("away", 150, True)
    assert service.check_pick("draw", None) == ("draw", 0, False)
    assert service.check_pick("draw", 0) == ("draw", 0, False)
    assert service.check_pick("missed", None) == ("missed", None, False)
    for side, margin, kwargs in (
        ("home", None, {}),
        ("home", 0, {}),
        ("away", 151, {}),
        ("home", True, {}),
        ("draw", 3, {}),
        ("missed", 0, {}),
        ("missed", None, {"own": True}),
        ("draw", 0, {"is_default": True}),
        ("missed", None, {"is_default": True}),
        ("home", 3, {"is_default": True, "default_picks": False}),
        ("sideways", 3, {}),
    ):
        assert code(lambda: service.check_pick(side, margin, **kwargs)) == "invalid_pick", (side, margin, kwargs)


def test_rules_merge_over_the_defaults_and_store_only_differences() -> None:
    champion = uuid4()
    assert service.merge_rules(None, None) == service.DEFAULT_RULES
    merged = service.merge_rules({"startingRound": 3, "winPoints": {"final": 4}, "stale": 1}, champion)
    assert merged["startingRound"] == 3 and merged["previousChampionMemberId"] == str(champion)
    assert merged["winPoints"] == {"regular": 1, "quarterFinal": 1.5, "semiFinal": 2, "final": 4}
    assert service.stored_rules(merged) == {"startingRound": 3, "winPoints": {"final": 4}}
    assert service.stored_rules(service.merge_rules(None, champion)) == {}
    season = SimpleNamespace(rules={"bonusPoint": False}, previous_champion_membership_id=None)
    assert service.season_rules(season) == {**service.DEFAULT_RULES, "bonusPoint": False}
    # The defaults themselves are never changed by a merge.
    service.apply_rules_change(merged, {"winPoints": {"regular": 9}})
    assert service.DEFAULT_RULES["winPoints"]["regular"] == 1


def test_rule_changes_are_checked() -> None:
    change = {"defaultPicks": False, "marginWindow": 6, "winPoints": {"semiFinal": 2.5}, "startingRound": 21, "previousChampionMemberId": None}
    assert service.check_rules_change(change, URC) == change
    member = uuid4()
    assert service.check_rules_change({"previousChampionMemberId": str(member)}, URC) == {"previousChampionMemberId": str(member)}
    for bad in (
        {"defaultPicks": 1},
        {"marginPoint": -0.5},
        {"marginPoint": None},
        {"marginPoint": True},
        {"bonusRange": float("inf")},
        {"grandSlamPoints": 1001},
        {"startingRound": 0},
        {"startingRound": 22},
        {"startingRound": 2.5},
        {"winPoints": {"playoff": 1}},
        {"winPoints": None},
        {"previousChampionMemberId": "not-a-member"},
        {"surprise": True},
    ):
        assert code(lambda: service.check_rules_change(bad, URC)) == "invalid_rules", bad


def test_a_result_comes_from_the_full_time_milestone_then_the_score_snapshot() -> None:
    live = {"state": "live", "home": {"score": 10}, "away": {"score": 7}}
    assert service.fixture_result({"home": 20, "away": 26}, live) == {"homeScore": 20, "awayScore": 26, "state": "full_time"}
    assert service.fixture_result({}, live) == {"homeScore": 10, "awayScore": 7, "state": "live"}
    assert service.fixture_result(None, {"state": "half_time", "home": {"score": 3}, "away": {"score": 0}})["state"] == "half_time"
    assert service.fixture_result(None, {"state": "cancelled", "home": {"score": None}, "away": {}}) == {
        "homeScore": 0,
        "awayScore": 0,
        "state": "cancelled",
    }
    assert service.fixture_result(None, {"state": "scheduled", "home": {"score": None}, "away": {"score": None}}) is None
    assert service.fixture_result(None, {"state": "live", "home": {"score": None}, "away": {"score": 3}}) is None
    assert service.fixture_result(None, None) is None


def test_picks_lock_at_the_scheduled_kickoff() -> None:
    fixture = URC.schedule().fixture("292592")
    assert fixture is not None and fixture.kickoff_utc == datetime(2026, 10, 2, 18, 45, tzinfo=timezone.utc)
    assert service.locked(fixture, datetime(2026, 10, 2, 18, 44, tzinfo=timezone.utc)) is False
    assert service.locked(fixture, fixture.kickoff_utc) is True
    unscheduled = next(f for f in URC.schedule().fixtures if f.kickoff_utc is None)
    assert service.locked(unscheduled, datetime(2030, 1, 1, tzinfo=timezone.utc)) is False
