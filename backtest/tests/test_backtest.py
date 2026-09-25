"""The backtest's own pieces on a small synthetic season: the archive source under the
kickoff guard, anonymisation, baselines and the metrics."""

import json
import math
from datetime import timedelta
from pathlib import Path

import pytest

import common  # noqa: F401 - puts apps/api on the import path

from app.agent.jev import BAND_KEYS, band_for, build_request
from app.agent.pick import pick
from app.agent.scoring import Pick
from app.agent.state import build_state

import baselines
import score
from anonymise import Pseudonyms
from archive import ArchiveSource, load_season, parse_match

SEASON = "202401"
# Leinster (5356) v Munster (4377) at the Aviva, then the return and a Leinster v Ulster (2129) semi-final.
ROWS = [
    (1, 1, 5356, 4377, "Aviva Stadium", "2024-09-20 18:00:00", 30, 10, 1),
    (2, 2, 4377, 5356, "Thomond Park", "2024-09-27 18:00:00", 20, 17, 1),
    (3, 20, 5356, 2129, "Aviva Stadium", "2025-06-07 16:00:00", 25, 25, 2),
]


def feed_row(match_id, round_number, home, away, venue, kickoff, home_score, away_score, round_type):
    events = [{"type": {"name": "try"}, "team": {"id": home}}] * 4 + [{"type": {"name": "conversion"}, "team": {"id": away}}]
    return {
        "match_id": match_id, "season_id": SEASON, "match_status": "result", "match_datetime": kickoff, "venue": venue,
        "home_team_id": home, "away_team_id": away, "home_score": home_score, "away_score": away_score,
        "stats_data": {"round": round_number, "roundTypeId": round_type, "events": events},
    }


def lineup(prefix: str) -> dict:
    players = [{"number": n, "name": f"{prefix} Player{n}", "position": "hooker" if n == 2 else None,
                "dateOfBirth": "1995-01-01"} for n in range(1, 24)]
    return {"starters": players[:15], "replacements": players[15:]}


@pytest.fixture
def data(tmp_path: Path) -> Path:
    (tmp_path / "seasons").mkdir()
    (tmp_path / "seasons" / f"{SEASON}.json").write_text(json.dumps({"matches": [feed_row(*r) for r in ROWS]}))
    (tmp_path / "lineups").mkdir()
    names = {5356: "Leinster", 4377: "Munster", 2129: "Ulster"}
    for match_id, _, home, away, *_ in ROWS:
        payload = {"matchStatus": "result", "home": lineup(names[home]), "away": lineup(names[away])}
        (tmp_path / "lineups" / f"{match_id}.json").write_text(json.dumps({"status": "ok", "payload": payload}))
    (tmp_path / "weather" / SEASON).mkdir(parents=True)
    hourly = {"time": ["2024-09-27T18:00"], "temperature_2m": [14.2], "wind_speed_10m": [30.4], "weather_code": [63]}
    (tmp_path / "weather" / SEASON / "thomond-park.json").write_text(json.dumps({"hourly": hourly}))
    return tmp_path


# Archive ------------------------------------------------------------------------------


def test_feed_rows_become_matches(data: Path) -> None:
    first, second, semi = load_season(SEASON, data)
    assert (first.fixture.home_id, first.fixture.away_id, first.fixture.round) == ("leinster-rugby", "munster-rugby", 1)
    assert (first.home_tries, first.away_tries, first.playoff) == (4, 0, False)
    assert semi.playoff and semi.result().table is False
    unfinished = feed_row(*ROWS[0]) | {"match_status": "fixture"}
    assert parse_match(SEASON, unfinished) is None


def test_the_archive_state_sees_only_earlier_results(data: Path) -> None:
    matches = load_season(SEASON, data)
    source = ArchiveSource(SEASON, matches, data)
    second = matches[1]
    state = build_state(second.fixture, source, second.kickoff - timedelta(hours=1))

    assert state["teamsheetStatus"] == "ok"
    assert state["weather"]["condition"] == "Rain" and state["weather"]["windKmh"] == 30.4
    form = state["form"]
    assert [r["fixtureId"] for r in form["home"]["recent"]] == ["1"]
    assert form["away"]["season"]["tablePoints"] == 5 and form["home"]["season"]["tablePoints"] == 0
    assert state["away"]["features"]["changesFromPrevious"]["comparedWith"] == "1"

    first = matches[0]
    assert build_state(first.fixture, source, first.kickoff)["form"]["home"]["season"] is None


# Anonymisation ------------------------------------------------------------------------


def test_anonymised_requests_name_nobody_and_stay_stable(data: Path) -> None:
    matches = load_season(SEASON, data)
    source = ArchiveSource(SEASON, matches, data)
    clubs = {c for m in matches for c in (m.fixture.home_id, m.fixture.away_id)}
    venues = {m.fixture.venue for m in matches}
    pseudonyms = Pseudonyms(SEASON, clubs, venues, source.player_names())
    state = build_state(matches[1].fixture, source, matches[1].kickoff - timedelta(hours=1))

    named = build_request(state)
    anonymised = build_request(pseudonyms.state(state))
    assert "Munster Rugby" in pseudonyms.leaks(named)
    assert pseudonyms.leaks(anonymised) == []
    home = anonymised["state"]["home"]
    assert home["club"] == pseudonyms.clubs["munster-rugby"]
    assert home["form"]["recentResults"] == [f"lost 10-30 away against {pseudonyms.clubs['leinster-rugby']}"]
    assert anonymised["state"]["match"]["country"] == "Ireland" and anonymised["state"]["match"]["city"] is None
    assert state["home"]["club"]["name"] == "Munster Rugby"  # the original is untouched

    again = Pseudonyms(SEASON, clubs, venues, source.player_names())
    other = Pseudonyms("202501", clubs, venues, source.player_names())
    assert again.players == pseudonyms.players and again.clubs == pseudonyms.clubs
    assert other.players != pseudonyms.players


# Baselines ----------------------------------------------------------------------------


def test_normal_bands_cover_every_margin() -> None:
    bands = baselines.normal_bands(0, 14)
    assert sum(bands.values()) == pytest.approx(1)
    assert bands["home_1_5"] == pytest.approx(bands["away_1_5"])
    # Bands blur the mean: the pick lands near, not exactly on, the home side by 7.
    chosen = pick(baselines.normal_bands(7, 14))
    assert chosen.winner == "home" and 5 <= chosen.margin <= 9


def test_elo_moves_ratings_towards_the_result_and_regresses_between_seasons(data: Path) -> None:
    first = load_season(SEASON, data)[0]
    elo = baselines.Elo(k=20, home_advantage=50, scale=0.05, sd=14)
    assert elo.difference(first) == 50
    elo.update(first)
    assert elo.ratings["leinster-rugby"] > 1500 > elo.ratings["munster-rugby"]
    gained = elo.ratings["leinster-rugby"] - 1500
    elo._new_season("202501")
    assert elo.ratings["leinster-rugby"] - 1500 == pytest.approx(0.75 * gained)


def test_table_position_backs_the_higher_side() -> None:
    def state(home, away):
        return {"form": {"status": "ok", "home": {"season": {"position": home}}, "away": {"season": {"position": away}}}}

    assert baselines.table_sign(state(2, 9)) == 1
    assert baselines.table_sign(state(9, 2)) == -1
    assert baselines.table_sign({"form": {"status": "ok", "home": {"season": None}, "away": {"season": None}}}) == 1


# Metrics ------------------------------------------------------------------------------


def certain(key: str) -> dict[str, float]:
    return {k: 1.0 if k == key else 0.0 for k in BAND_KEYS}


def test_ranked_probability_score() -> None:
    assert score.rps(certain("home_1_5"), "home_1_5") == 0
    assert score.rps(certain("away_31_plus"), "home_31_plus") == 1
    # One band away costs one step of the 12: (1 - 0)^2 / 12.
    assert score.rps(certain("home_1_5"), "home_6_10") == pytest.approx(1 / 12)


def test_log_loss_and_brier_use_outcomes() -> None:
    even = {k: 1 / 13 for k in BAND_KEYS}
    assert score.log_loss(even, "home") == pytest.approx(-math.log(6 / 13))
    assert score.log_loss(certain("away_1_5"), "home") == pytest.approx(-math.log(score.LOG_FLOOR))
    assert score.brier(certain("draw"), "draw") == 0
    assert score.brier(certain("draw"), "home") == 2


def fake_row(fixture: str, model: str, key: str, home: int, away: int, round_number: int = 1) -> dict:
    chosen = pick(certain(key))
    return {"season": "202201", "round": round_number, "fixture_id": fixture, "model": model, "home_score": home,
            "away_score": away, "pick_winner": chosen.winner, "pick_margin": chosen.margin, "distribution": certain(key)}


def test_rows_are_compared_only_where_every_model_answered() -> None:
    rows = [fake_row("1", "elo", "home_1_5", 20, 17), fake_row("1", "jev_named", "home_1_5", 20, 17),
            fake_row("2", "elo", "away_1_5", 10, 13)]
    kept, models, dropped = score.comparable(rows, ["202201"])
    assert models == ["elo", "jev_named"] and dropped == 1 and {r["fixture_id"] for r in kept} == {"1"}


def test_summaries_count_points_and_grand_slams() -> None:
    rows = [score.scored(fake_row(str(n), "elo", "home_1_5", 20, 17)) for n in range(4)]
    rows.append(score.scored(fake_row("9", "elo", "home_1_5", 10, 13, round_number=2)))
    summary = score.summarise(rows, "elo")
    assert summary["points"] == 4 * 1.5 + 0.5  # the round-2 miss is within 5
    assert summary["grandSlams"] == 1
    assert band_for(10, 13) == "away_1_5"
    intervals = score.bootstrap(rows, ["elo"])
    assert intervals == score.bootstrap(rows, ["elo"])
