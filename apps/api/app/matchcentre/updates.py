"""Competition events of a round for the notifications panel: teamsheets published, Piele
preview published, kick-off and full time. Built from the match centre's cached provider
snapshots, the stored previews and the fixture milestones, so one request per round covers
every fixture. Nothing here calls a provider that the match centre would not call anyway.

The runtime pool holds one connection, and the match centre's snapshot cache needs it. So
the database work happens in two short transactions, before and after the provider calls,
and never while they run: a request that held its transaction through them starved the
whole API for 30 seconds at a time (seen in production on 26 September 2026).
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Callable, Mapping, Protocol

from sqlalchemy.engine import Connection, Engine

from app.agent import previews
from app.matchcentre import milestones
from app.matchcentre.milestones import FULL_TIME, TEAMSHEETS_PUBLISHED, Milestone, MilestoneKey
from app.matchcentre.providers import scores
from app.matchcentre.providers.teamsheets import PUBLISH_WINDOW
from app.matchcentre.schedule import Fixture, load_schedule
from app.matchcentre.service import MatchCentreService

# Teamsheets are looked for from the publication window until this long after kickoff.
# A fixture whose teamsheets were never seen by then gets no notification.
TEAMSHEET_GRACE = timedelta(days=2)
STARTED = frozenset({"live", "half_time", "full_time"})
NOT_PLAYED = frozenset({"postponed", "cancelled"})


class StoredPreview(Protocol):
    revision: int
    generated_at: datetime


def teamsheets_due(fixture: Fixture, now: datetime) -> bool:
    """Whether the teamsheets of a fixture without a milestone are worth a look now."""
    if fixture.kickoff_utc is None or fixture.home_id is None or fixture.away_id is None:
        return False
    return fixture.kickoff_utc - PUBLISH_WINDOW <= now <= fixture.kickoff_utc + TEAMSHEET_GRACE


def build_events(
    fixtures: list[Fixture],
    known: Mapping[MilestoneKey, Milestone],
    stored_previews: Mapping[str, StoredPreview],
    matches: Mapping[str, Mapping[str, Any]],
    now: datetime,
) -> list[dict[str, Any]]:
    """The round's events in time order. Pure: every input is already fetched.

    Kick-off follows the published time: once it has passed the match has kicked off unless
    the score feed says postponed or cancelled. The feed confirms an earlier start but is
    never required, so a feed outage does not hide a kick-off.
    """
    events: list[dict[str, Any]] = []
    for fixture in fixtures:
        sheets = known.get((fixture.id, TEAMSHEETS_PUBLISHED))
        if sheets is not None:
            events.append({"kind": TEAMSHEETS_PUBLISHED, "fixtureId": fixture.id, "occurredAt": sheets.observed_at})
        preview = stored_previews.get(fixture.id)
        if preview is not None:
            events.append(
                {
                    "kind": "preview_published",
                    "fixtureId": fixture.id,
                    "occurredAt": preview.generated_at,
                    "revision": preview.revision,
                }
            )
        final = known.get((fixture.id, FULL_TIME))
        state = (matches.get(fixture.id) or {}).get("state")
        kicked_off = fixture.kickoff_utc is not None and (
            state in STARTED or final is not None or (fixture.kickoff_utc <= now and state not in NOT_PLAYED)
        )
        if kicked_off:
            events.append({"kind": "kicked_off", "fixtureId": fixture.id, "occurredAt": fixture.kickoff_utc})
        if final is not None:
            events.append(
                {
                    "kind": FULL_TIME,
                    "fixtureId": fixture.id,
                    "occurredAt": final.observed_at,
                    "homeScore": final.detail.get("home"),
                    "awayScore": final.detail.get("away"),
                }
            )
    return sorted(events, key=lambda event: (event["occurredAt"], event["fixtureId"], event["kind"]))


def round_updates(
    engine: Engine,
    centre: MatchCentreService,
    round_number: int,
    now: datetime,
    authorise: Callable[[Connection], Any],
) -> dict[str, Any]:
    """The round's events for a member. `authorise` resolves the caller inside the first
    transaction and raises when they are not a member."""
    fixtures = load_schedule().round(round_number)
    ids = [fixture.id for fixture in fixtures]
    with engine.begin() as connection:
        authorise(connection)
        known = dict(milestones.by_fixture(connection, ids))
        stored = previews.latest_by_fixture(connection, ids)

    # Provider work with no transaction open: the snapshot cache takes the pool's connection.
    pending = [f for f in fixtures if (f.id, TEAMSHEETS_PUBLISHED) not in known and teamsheets_due(f, now)]
    sections: list[dict[str, Any]] = []
    if pending:
        with ThreadPoolExecutor(max_workers=4) as pool:
            sections = list(pool.map(lambda f: centre.teamsheets(f, now), pending))
    matches: dict[str, Mapping[str, Any]] = {}
    if any(scores.started(fixture, now) for fixture in fixtures):
        round_scores = centre.round_scores(round_number, now)
        if round_scores.get("status") == "ok":
            matches = {match["fixtureId"]: match for match in round_scores["matches"]}

    observed: list[tuple[str, str, datetime, dict[str, Any]]] = []
    for fixture, section in zip(pending, sections):
        if section.get("status") == "ok":
            observed.append((fixture.id, TEAMSHEETS_PUBLISHED, section.get("fetchedAt") or now, {}))
    for fixture in fixtures:
        match = matches.get(fixture.id)
        if match and match.get("state") == "full_time" and (fixture.id, FULL_TIME) not in known:
            detail = {"home": match["home"]["score"], "away": match["away"]["score"]}
            observed.append((fixture.id, FULL_TIME, now, detail))
    if observed:
        with engine.begin() as connection:
            for fixture_id, kind, at, detail in observed:
                known[(fixture_id, kind)] = milestones.record(connection, fixture_id, kind, at, detail)

    return {
        "round": round_number,
        "generatedAt": now,
        "events": build_events(fixtures, known, stored, matches, now),
    }
