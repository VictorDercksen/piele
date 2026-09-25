from datetime import timedelta

from app.matchcentre import service as service_module
from app.matchcentre.providers import scores
from app.matchcentre.schedule import load_schedule
from tests.test_matches import FIXTURE, KICKOFF, Upstream, make_client

HOME, AWAY = 2019, 3533  # Benetton, Dragons
ROUND_ONE = [int(f.id) for f in load_schedule().round(1)]


def event(event_id, minute, kind, display, team=None, player=None, period="first half", time=None):
    return {
        "id": event_id,
        "minute": minute,
        "second": 0,
        "time": time or str(minute),
        "display": display,
        "type": {"name": kind},
        "period": {"name": period},
        "team": {"id": team} if team else None,
        "player": {"name": player} if player else None,
    }


def feed_match(match_id, *, status="fixture", period="pre match", minute=0, finalised=0, score=(0, 0), ht=(0, 0), events=()):
    return {
        "match_id": match_id,
        "match_status": status,
        "match_period": period,
        "home_score": score[0],
        "away_score": score[1],
        "stats_data": {
            "matchStatus": status,
            "period": period,
            "minute": minute,
            "timerRunning": period in ("first half", "second half"),
            "finalised": finalised,
            "homeTeam": {"id": HOME, "score": {"currentScore": score[0], "htScore": ht[0]}},
            "awayTeam": {"id": AWAY, "score": {"currentScore": score[1], "htScore": ht[1]}},
            "events": list(events),
        },
    }


FIRST_HALF = [
    event(1, 0, "period", "first half start"),
    event(2, 6, "goal kick", "penalty goal", HOME, "Home Kicker"),
    event(3, 12, "goal kick", "missed penalty", HOME, "Home Kicker"),
    event(4, 18, "try", "try", AWAY, "Away Wing"),
    event(5, 19, "goal kick", "conversion", AWAY, "Away Ten"),
    event(6, 25, "substitution", "substitution", AWAY),
    event(7, 30, "card", "yellow", HOME, "Home Lock"),
    event(8, 38, "try", "penalty try", HOME),
    event(9, 40, "period", "first half end", time="40+1"),
]


def round_feed(*matches):
    by_id = {m["match_id"]: m for m in matches}
    return {"data": {"matchstats": [by_id.get(i) or feed_match(i) for i in ROUND_ONE]}}


def test_round_before_kickoff_makes_no_feed_call(monkeypatch) -> None:
    upstream = Upstream()
    client = make_client(upstream, KICKOFF - timedelta(hours=1), monkeypatch)
    body = client.get("/v1/rounds/1/scores").json()
    assert body["status"] == "too_early"
    assert [m["fixtureId"] for m in body["matches"]] == [str(i) for i in ROUND_ONE]
    assert {m["state"] for m in body["matches"]} == {"scheduled"}
    assert upstream.calls == {}
    assert client.get("/v1/rounds/99/scores").status_code == 404


def test_live_round_is_cached_briefly(monkeypatch) -> None:
    live = feed_match(int(FIXTURE), status="live", period="first half", minute=31, score=(3, 7), events=FIRST_HALF[:6])
    upstream = Upstream(scores=round_feed(live))
    now = KICKOFF + timedelta(minutes=35)
    client = make_client(upstream, now, monkeypatch)
    body = client.get("/v1/rounds/1/scores").json()
    assert body["status"] == "ok"
    match = next(m for m in body["matches"] if m["fixtureId"] == FIXTURE)
    assert match == {
        "fixtureId": FIXTURE,
        "state": "live",
        "period": "first half",
        "minute": 31,
        "clockRunning": True,
        "home": {"score": 3, "halfTime": 0},
        "away": {"score": 7, "halfTime": 0},
    }
    other = next(m for m in body["matches"] if m["fixtureId"] != FIXTURE)
    assert other["state"] == "scheduled" and other["home"]["score"] is None
    # One query covers the whole round, and the match centre reuses the snapshot.
    assert upstream.score_requests == [{"ids": ROUND_ONE}]
    client.get(f"/v1/matches/{FIXTURE}")
    assert len(upstream.score_requests) == 1

    monkeypatch.setattr(service_module, "now_utc", lambda: now + timedelta(seconds=25))
    client.get("/v1/rounds/1/scores")
    assert len(upstream.score_requests) == 2


def test_match_centre_timeline_and_half_time(monkeypatch) -> None:
    half_time = feed_match(int(FIXTURE), status="live", period="first half", minute=40, score=(10, 7), ht=(10, 7), events=FIRST_HALF)
    client = make_client(Upstream(scores=round_feed(half_time)), KICKOFF + timedelta(minutes=50), monkeypatch)
    section = client.get(f"/v1/matches/{FIXTURE}").json()["score"]
    assert section["status"] == "ok"
    assert section["state"] == "half_time"
    assert section["home"] == {"score": 10, "halfTime": 10}
    assert [(e["kind"], e["side"], e["score"]) for e in section["events"]] == [
        ("penalty_goal", "home", [3, 0]),
        ("try", "away", [3, 5]),
        ("conversion", "away", [3, 7]),
        ("yellow_card", "home", None),
        ("penalty_try", "home", [10, 7]),
    ]
    assert section["events"][1] == {
        "id": 4,
        "minute": 18,
        "time": "18",
        "period": "first half",
        "side": "away",
        "kind": "try",
        "points": 5,
        "player": "Away Wing",
        "score": [3, 5],
    }


def test_full_time_and_feed_failure(monkeypatch) -> None:
    final = feed_match(int(FIXTURE), status="result", period="post match", minute=81, finalised=1, score=(10, 7), ht=(10, 7), events=FIRST_HALF)
    client = make_client(Upstream(scores=round_feed(final)), KICKOFF + timedelta(hours=3), monkeypatch)
    section = client.get(f"/v1/matches/{FIXTURE}").json()["score"]
    assert section["state"] == "full_time"
    assert section["minute"] is None

    down = make_client(Upstream(fail={"www.unitedrugby.com"}), KICKOFF + timedelta(minutes=10), monkeypatch)
    body = down.get("/v1/rounds/1/scores").json()
    assert body["status"] == "unavailable"
    assert body["reason"] == "HTTP 503"
    assert {m["state"] for m in body["matches"]} == {"scheduled"}
    assert down.get(f"/v1/matches/{FIXTURE}").json()["score"]["status"] == "unavailable"


def test_rejected_scores_query_is_unavailable(monkeypatch) -> None:
    upstream = Upstream(scores={"errors": [{"message": "Cannot query field minute"}]})
    client = make_client(upstream, KICKOFF + timedelta(minutes=10), monkeypatch)
    body = client.get("/v1/rounds/1/scores").json()
    assert body["status"] == "unavailable"
    assert body["reason"] == "provider error: Cannot query field minute"


def test_match_state_rules() -> None:
    assert scores.match_state("fixture", "pre match", False, []) == "scheduled"
    assert scores.match_state("live", "first half", False, []) == "live"
    assert scores.match_state("live", "half time", False, []) == "half_time"
    assert scores.match_state("live", "first half", False, FIRST_HALF) == "half_time"
    assert scores.match_state("live", "second half", False, FIRST_HALF + [event(10, 40, "period", "second half start")]) == "live"
    assert scores.match_state("result", "post match", True, []) == "full_time"
    assert scores.match_state("postponed", "pre match", False, []) == "postponed"
    assert scores.match_state("cancelled", "", False, []) == "cancelled"


def test_snapshot_lifetime_follows_the_round() -> None:
    fixtures = load_schedule().round(1)
    friday = [f for f in fixtures if f.kickoff_utc == KICKOFF]
    saturday = min(f.kickoff_utc for f in fixtures if f.kickoff_utc > KICKOFF)
    live = {f.id: {"state": "live"} for f in friday}
    assert scores.snapshot_ttl(fixtures, live, KICKOFF + timedelta(minutes=20)) == scores.TTL_LIVE
    done = {f.id: {"state": "full_time"} for f in friday}
    evening = KICKOFF + timedelta(hours=2)
    assert scores.snapshot_ttl(fixtures, done, evening) == scores.TTL_IDLE_MAX
    morning = saturday - timedelta(hours=1)
    assert scores.snapshot_ttl(fixtures, done, morning) == timedelta(minutes=45)
    # A match never finalised stops holding the round live once its window closes.
    assert scores.snapshot_ttl(fixtures, live, saturday - timedelta(hours=1)) == timedelta(minutes=45)
    finished = {f.id: {"state": "full_time"} for f in fixtures}
    assert scores.snapshot_ttl(fixtures, finished, saturday + timedelta(hours=10)) == scores.TTL_IDLE_MAX
