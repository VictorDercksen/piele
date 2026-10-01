"""The push job, run by Vercel Cron through GET /v1/cron/push every few minutes:

1. Looks for newly published teamsheets of the fixtures inside the publication window and
   records them as milestones, as the notifications panel would when a member opens it.
2. Announces competition events once: teamsheets published and a fixture's first Pavilion
   preview, to every member of a league playing the competition.
3. Reminds members of the matches they have not picked: 24 hours before kickoff, and again
   1 hour before.
4. Sends the queued messages (league events queue theirs in their own requests).

The runtime pool holds one connection and the match centre's snapshot cache needs it, so
provider calls happen outside any transaction (see app/matchcentre/updates.py). Every
transaction sets piele.job to 'push'; league reads set that league's context as well.
"""

import hashlib
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable, Iterator, Mapping, Protocol
from uuid import UUID

from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection, Engine

from app import competitions
from app.agent.previews import match_previews
from app.competitions import Competition
from app.league import tables as t
from app.league.context import set_context
from app.league.service import merge_rules
from app.matchcentre import milestones
from app.matchcentre.milestones import TEAMSHEETS_PUBLISHED
from app.matchcentre.schedule import Fixture
from app.matchcentre.service import MatchCentreService
from app.matchcentre.updates import teamsheets_due
from app.push.league_events import when
from app.push.outbox import Message, enqueue, join_names, muted
from app.push.tables import push_announcements, push_outbox, push_reminders, push_subscriptions
from app.push.webpush import DEFAULT_TTL_SECONDS, Outcome, Subscription

log = logging.getLogger(__name__)

PREVIEW_PUBLISHED = "preview_published"
# Events older than this when the job first sees them are not announced (a job outage, or
# the first run after deployment).
ANNOUNCE_WINDOW = timedelta(hours=6)
REMINDER_LEADS = (("1h", timedelta(hours=1)), ("24h", timedelta(hours=24)))
SEND_BATCH = 100
SEND_BATCHES = 5
MAX_ATTEMPTS = 3
LEASE = timedelta(minutes=2)
RETRY_AFTER = timedelta(minutes=4)
KEEP_SENT = timedelta(days=14)
KEEP_REMINDERS = timedelta(days=30)


class Sender(Protocol):
    """WebPushSender, or a fake in tests."""

    @property
    def public_key(self) -> str: ...

    def send(self, subscription: Subscription, payload: bytes, *, ttl: int, urgency: str) -> Outcome: ...


@dataclass(frozen=True)
class League:
    id: UUID
    slug: str
    name: str
    timezone: str
    season_id: UUID
    competition: Competition
    # The season's Superbru rules start picks at this round.
    starting_round: int = 1


@dataclass(frozen=True)
class Member:
    id: UUID
    user_id: UUID
    push_muted: Any


@dataclass
class Summary:
    teamsheets_observed: int = 0
    announced: int = 0
    reminders: int = 0
    sent: int = 0
    dropped: int = 0
    failed: int = 0
    gone: int = 0


@contextmanager
def begin(engine: Engine) -> Iterator[Connection]:
    """A job transaction: piele.job is set before anything else runs in it."""
    with engine.begin() as connection:
        set_context(connection, "job", "push")
        yield connection


def run(engine: Engine, centres: Mapping[str, MatchCentreService], sender: Sender, now: datetime) -> Summary:
    summary = Summary()
    with begin(engine) as connection:
        leagues = active_leagues(connection)
    playing = {league.competition.id for league in leagues}
    for competition_id in sorted(playing):
        centre = centres.get(competition_id)
        if centre is None:
            continue
        summary.teamsheets_observed += observe_teamsheets(engine, centre, now)
    with begin(engine) as connection:
        members = {league.id: league_members(connection, league) for league in leagues}
        several = _accounts_in_several(members)
        for competition_id in sorted(playing):
            summary.announced += announce(connection, competitions.ALL[competition_id], leagues, members, now)
        for league in leagues:
            summary.reminders += remind(connection, league, members[league.id], several, now)
    drain(engine, sender, now, summary)
    with begin(engine) as connection:
        connection.execute(
            delete(push_outbox).where(push_outbox.c.status != "pending", push_outbox.c.created_at < now - KEEP_SENT)
        )
    return summary


# Leagues and members ------------------------------------------------------------------------


def active_leagues(connection: Connection) -> list[League]:
    """Active leagues with an active season on a known competition. Seasons are read inside
    each league's context."""
    lg, s = t.leagues, t.seasons
    rows = connection.execute(
        select(lg.c.id, lg.c.slug, lg.c.name, lg.c.timezone).where(lg.c.status == "active").order_by(lg.c.created_at)
    ).all()
    leagues = []
    try:
        for row in rows:
            set_context(connection, "league_id", str(row.id))
            season = connection.execute(
                select(s.c.id, s.c.competition_id, s.c.rules).where(s.c.league_id == row.id, s.c.status == "active")
            ).first()
            competition = competitions.ALL.get(season.competition_id) if season is not None else None
            if competition is not None:
                starting_round = merge_rules(season.rules, None)["startingRound"]
                leagues.append(League(row.id, row.slug, row.name, row.timezone, season.id, competition, starting_round))
    finally:
        set_context(connection, "league_id", None)
    return leagues


def league_members(connection: Connection, league: League) -> list[Member]:
    """The league's active, claimed members in its active season."""
    m, sm = t.league_memberships, t.season_memberships
    set_context(connection, "league_id", str(league.id))
    rows = connection.execute(
        select(m.c.id, m.c.user_id, m.c.push_muted)
        .select_from(m.join(sm, sm.c.membership_id == m.c.id))
        .where(
            m.c.league_id == league.id,
            m.c.status == "active",
            m.c.user_id.is_not(None),
            sm.c.season_id == league.season_id,
            sm.c.status == "active",
        )
        .order_by(m.c.joined_at, m.c.id)
    ).all()
    set_context(connection, "league_id", None)
    return [Member(row.id, row.user_id, row.push_muted) for row in rows]


def _accounts_in_several(members: Mapping[UUID, list[Member]]) -> set[UUID]:
    seen: set[UUID] = set()
    several: set[UUID] = set()
    for league_members_ in members.values():
        for member in league_members_:
            (several if member.user_id in seen else seen).add(member.user_id)
    return several


# Competition events -------------------------------------------------------------------------


def observe_teamsheets(engine: Engine, centre: MatchCentreService, now: datetime) -> int:
    """Records teamsheets first seen published for the fixtures ahead in the publication
    window. Returns how many were recorded."""
    competition_id = centre.competition.id
    candidates = [
        f for f in centre.competition.schedule().fixtures if teamsheets_due(f, now) and f.kickoff_utc and f.kickoff_utc > now
    ]
    if not candidates:
        return 0
    with begin(engine) as connection:
        known = milestones.by_fixture(connection, competition_id, [f.id for f in candidates])
    pending = [f for f in candidates if (f.id, TEAMSHEETS_PUBLISHED) not in known]
    if not pending:
        return 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        sections = list(pool.map(lambda f: centre.teamsheets(f, now), pending))
    published = [(f, s) for f, s in zip(pending, sections) if s.get("status") == "ok"]
    if published:
        with begin(engine) as connection:
            for fixture, section in published:
                milestones.record(connection, competition_id, fixture.id, TEAMSHEETS_PUBLISHED, section.get("fetchedAt") or now, {})
    return len(published)


def new_events(connection: Connection, competition: Competition, now: datetime) -> dict[str, list[Fixture]]:
    """Competition events not announced yet, by kind, recorded as announced. Only events seen
    within ANNOUNCE_WINDOW and fixtures still to kick off."""
    schedule = competition.schedule()
    since = now - ANNOUNCE_WINDOW
    fm = milestones.fixture_milestones
    candidates: list[tuple[str, str]] = [
        (row.fixture_id, TEAMSHEETS_PUBLISHED)
        for row in connection.execute(
            select(fm.c.fixture_id).where(
                fm.c.competition_id == competition.id, fm.c.kind == TEAMSHEETS_PUBLISHED, fm.c.observed_at >= since
            )
        )
    ]
    mp = match_previews
    candidates += [
        (row.fixture_id, PREVIEW_PUBLISHED)
        for row in connection.execute(
            select(mp.c.fixture_id)
            .where(mp.c.competition_id == competition.id)
            .group_by(mp.c.fixture_id)
            .having(func.min(mp.c.generated_at) >= since)
        )
    ]
    events: dict[str, list[Fixture]] = {}
    for fixture_id, kind in candidates:
        fixture = schedule.fixture(fixture_id)
        if fixture is None or fixture.kickoff_utc is None or fixture.kickoff_utc <= now:
            continue
        claimed = connection.execute(
            insert(push_announcements)
            .values(competition_id=competition.id, fixture_id=fixture_id, kind=kind, announced_at=now)
            .on_conflict_do_nothing()
            .returning(push_announcements.c.fixture_id)
        ).first()
        if claimed is not None:
            events.setdefault(kind, []).append(fixture)
    for fixtures in events.values():
        fixtures.sort(key=lambda f: (f.kickoff_utc, f.id))
    return events


def matchup(competition: Competition, fixture: Fixture) -> str:
    def name(club_id: str | None) -> str:
        club = competition.club(club_id)
        return club.name if club else "TBC"

    return f"{name(fixture.home_id)} v {name(fixture.away_id)}"


def event_message(kind: str, competition: Competition, fixtures: list[Fixture], league: League) -> tuple[str, str, str]:
    """Title, body and path of a competition event message."""
    names = [matchup(competition, f) for f in fixtures]
    first = fixtures[0]
    path = f"/{league.slug}/match/{first.id}" if len(fixtures) == 1 else f"/{league.slug}"
    if kind == TEAMSHEETS_PUBLISHED:
        if len(fixtures) == 1:
            return "Teamsheets are out", f"{names[0]}, {when(first.kickoff_utc, league.timezone)}.", path
        return f"Teamsheets are out for {len(fixtures)} matches", f"{join_names(names)}.", path
    if len(fixtures) == 1:
        return "The Pavilion preview is up", f"{names[0]}, {when(first.kickoff_utc, league.timezone)}.", path
    return f"{len(fixtures)} Pavilion previews are up", f"{join_names(names)}.", path


def _digest(parts: Iterable[str]) -> str:
    return hashlib.sha256(",".join(parts).encode()).hexdigest()[:24]


def announce(
    connection: Connection,
    competition: Competition,
    leagues: list[League],
    members: Mapping[UUID, list[Member]],
    now: datetime,
) -> int:
    """Queues one message per account and kind for the competition's new events. An account
    in several leagues on the competition hears once, linked to the first league."""
    events = new_events(connection, competition, now)
    queued: list[Message] = []
    for kind, fixtures in events.items():
        ids = [f.id for f in fixtures]
        heard: set[UUID] = set()
        for league in leagues:
            if league.competition.id != competition.id:
                continue
            title, body, path = event_message(kind, competition, fixtures, league)
            for member in members[league.id]:
                if member.user_id in heard or muted(member.push_muted, kind):
                    continue
                heard.add(member.user_id)
                queued.append(
                    Message(
                        user_id=member.user_id,
                        league_id=league.id,
                        kind=kind,
                        dedup_key=f"{kind}:{competition.id}:{_digest(ids)}:{member.user_id}",
                        title=title,
                        body=body,
                        url=path,
                        tag=f"{kind}:{competition.id}:{_digest(ids)}",
                        expires_at=fixtures[0].kickoff_utc,
                    )
                )
    enqueue(connection, queued)
    return len(queued)


# Pick reminders -----------------------------------------------------------------------------


def lead_for(kickoff: datetime, now: datetime) -> str | None:
    """The reminder due for a fixture: 1h inside the last hour, 24h inside the last day."""
    for lead, window in REMINDER_LEADS:
        if now < kickoff <= now + window:
            return lead
    return None


def reminder_message(
    lead: str, competition: Competition, fixtures: list[Fixture], league: League, prefix: bool
) -> tuple[str, str, str]:
    names = [matchup(competition, f) for f in fixtures]
    first = fixtures[0]
    kickoff = when(first.kickoff_utc, league.timezone)
    if lead == "1h":
        title = "One hour to kickoff"
        body = f"No pick yet for {join_names(names)}."
    elif len(fixtures) == 1:
        title = "Your pick is due"
        body = f"No pick yet for {names[0]}. Kickoff {kickoff}."
    else:
        title = f"{len(fixtures)} picks are due"
        body = f"No pick yet for {join_names(names)}. First kickoff {kickoff}."
    if prefix:
        title = f"{league.name}: {title}"
    return title, body, f"/{league.slug}/match/{first.id}"


def remind(connection: Connection, league: League, members: list[Member], several: set[UUID], now: datetime) -> int:
    """Queues the league's pick reminders: per member and lead, the matches kicking off within
    the lead that the member has not picked and was not reminded of at that lead."""
    competition = league.competition
    due: dict[str, str] = {}
    fixtures: dict[str, Fixture] = {}
    for fixture in competition.schedule().fixtures:
        if fixture.kickoff_utc is None or fixture.home_id is None or fixture.away_id is None:
            continue
        if fixture.round < league.starting_round:
            continue
        lead = lead_for(fixture.kickoff_utc, now)
        if lead is not None:
            due[fixture.id] = lead
            fixtures[fixture.id] = fixture
    set_context(connection, "league_id", str(league.id))
    try:
        connection.execute(
            delete(push_reminders).where(push_reminders.c.league_id == league.id, push_reminders.c.created_at < now - KEEP_REMINDERS)
        )
        if not due or not members:
            return 0
        # A pick is the account's on the competition (members here are claimed), so a member
        # who picked in another league on the same competition is not reminded.
        p = t.picks
        picked = {
            (row.user_id, row.fixture_id)
            for row in connection.execute(
                select(p.c.user_id, p.c.fixture_id).where(
                    p.c.user_id.in_([member.user_id for member in members]),
                    p.c.competition_id == competition.id,
                    p.c.fixture_id.in_(list(due)),
                )
            )
        }
        queued: list[Message] = []
        for member in members:
            if muted(member.push_muted, "pick_reminder"):
                continue
            missing = [fid for fid in due if (member.user_id, fid) not in picked]
            if not missing:
                continue
            claimed = connection.execute(
                insert(push_reminders)
                .values(
                    [
                        {"league_id": league.id, "membership_id": member.id, "fixture_id": fid, "lead": due[fid], "created_at": now}
                        for fid in missing
                    ]
                )
                .on_conflict_do_nothing()
                .returning(push_reminders.c.fixture_id)
            ).scalars()
            by_lead: dict[str, list[Fixture]] = {}
            for fixture_id in claimed:
                by_lead.setdefault(due[fixture_id], []).append(fixtures[fixture_id])
            for lead, lead_fixtures in by_lead.items():
                lead_fixtures.sort(key=lambda f: (f.kickoff_utc, f.id))
                title, body, path = reminder_message(lead, competition, lead_fixtures, league, member.user_id in several)
                queued.append(
                    Message(
                        user_id=member.user_id,
                        league_id=league.id,
                        kind="pick_reminder",
                        dedup_key=f"pick_reminder:{member.id}:{lead}:{_digest(f.id for f in lead_fixtures)}",
                        title=title,
                        body=body,
                        url=path,
                        tag=f"picks:{league.id}",
                        expires_at=lead_fixtures[0].kickoff_utc,
                    )
                )
        enqueue(connection, queued)
        return len(queued)
    finally:
        set_context(connection, "league_id", None)


# Sending ------------------------------------------------------------------------------------


def payload(row: Any) -> bytes:
    return json.dumps({"title": row.title, "body": row.body, "url": row.url, "tag": row.tag}, separators=(",", ":")).encode()


def claim(connection: Connection, now: datetime) -> tuple[list[Any], dict[UUID, list[Any]]]:
    """Leases up to SEND_BATCH due messages and returns them with their accounts'
    subscriptions. Drops expired messages and those whose account left the league."""
    o, s, m = push_outbox, push_subscriptions, t.league_memberships
    newer = s.alias("newer")
    # A browser signed into another account since: the newer account keeps it.
    connection.execute(
        delete(s).where(exists().where(newer.c.endpoint == s.c.endpoint, newer.c.updated_at > s.c.updated_at))
    )
    connection.execute(
        update(o).where(o.c.status == "pending", o.c.expires_at <= now).values(status="dropped", last_error="expired")
    )
    member = exists().where(m.c.league_id == o.c.league_id, m.c.user_id == o.c.user_id, m.c.status == "active")
    connection.execute(
        update(o)
        .where(o.c.status == "pending", o.c.league_id.is_not(None), ~member)
        .values(status="dropped", last_error="not a member")
    )
    # Leases use the database clock, not the run's start: a long run or an overlapping one
    # never sees a lease as expired while its batch is still being sent.
    free = or_(o.c.lease_until.is_(None), o.c.lease_until < func.now())
    # A run that died after claiming leaves its rows leased; they count as attempts.
    connection.execute(
        update(o)
        .where(o.c.status == "pending", free, o.c.attempts >= MAX_ATTEMPTS)
        .values(status="failed", lease_until=None, last_error="no outcome recorded")
    )
    rows = connection.execute(
        select(o)
        .where(o.c.status == "pending", free)
        .order_by(o.c.created_at)
        .limit(SEND_BATCH)
        .with_for_update(skip_locked=True)
    ).all()
    if not rows:
        return [], {}
    connection.execute(
        update(o).where(o.c.id.in_([r.id for r in rows])).values(lease_until=func.now() + LEASE, attempts=o.c.attempts + 1)
    )
    subscriptions: dict[UUID, list[Any]] = {}
    for sub in connection.execute(select(s).where(s.c.user_id.in_({r.user_id for r in rows}))):
        subscriptions.setdefault(sub.user_id, []).append(sub)
    return rows, subscriptions


def drain(engine: Engine, sender: Sender, now: datetime, summary: Summary) -> int:
    """Sends up to SEND_BATCHES batches; the rest wait for the next run. Returns how many
    messages it handled."""
    handled = 0
    for _ in range(SEND_BATCHES):
        with begin(engine) as connection:
            rows, subscriptions = claim(connection, now)
        if not rows:
            break
        handled += len(rows)
        jobs = [(row, sub) for row in rows for sub in subscriptions.get(row.user_id, [])]

        def send(job: tuple[Any, Any]) -> Outcome:
            row, sub = job
            ttl = max(0, min(DEFAULT_TTL_SECONDS, int((row.expires_at - now).total_seconds())))
            urgency = "high" if row.kind in ("pick_reminder", "case_review") else "normal"
            try:
                return sender.send(Subscription(sub.endpoint, sub.p256dh, sub.auth), payload(row), ttl=ttl, urgency=urgency)
            except Exception as exc:  # A sender bug must not stop the batch.
                log.exception("push send failed")
                return Outcome(False, False, None, type(exc).__name__)

        with ThreadPoolExecutor(max_workers=8) as pool:
            outcomes = list(pool.map(send, jobs))
        record_outcomes(engine, rows, jobs, outcomes, now, summary)
    return handled


def record_outcomes(
    engine: Engine, rows: list[Any], jobs: list[tuple[Any, Any]], outcomes: list[Outcome], now: datetime, summary: Summary
) -> None:
    o, s = push_outbox, push_subscriptions
    delivered: set[UUID] = set()
    errors: dict[UUID, str] = {}
    gone: set[UUID] = set()
    alive: set[UUID] = set()
    for (row, sub), outcome in zip(jobs, outcomes):
        if outcome.delivered:
            delivered.add(row.id)
            alive.add(sub.id)
        elif outcome.gone:
            gone.add(sub.id)
        else:
            errors[row.id] = f"{outcome.status or ''} {outcome.error or ''}".strip()[:300]
    with begin(engine) as connection:
        if gone:
            connection.execute(delete(s).where(s.c.id.in_(gone)))
        if alive:
            connection.execute(update(s).where(s.c.id.in_(alive)).values(last_success_at=now))
        for row in rows:
            if row.id in delivered:
                values = {"status": "sent", "sent_at": now, "lease_until": None, "last_error": None}
                summary.sent += 1
            elif row.id in errors:
                # Claiming counted this attempt. A retry waits for the next run.
                failed = row.attempts + 1 >= MAX_ATTEMPTS
                values = {
                    "status": "failed" if failed else "pending",
                    "lease_until": None if failed else func.now() + RETRY_AFTER,
                    "last_error": errors[row.id],
                }
                if failed:
                    summary.failed += 1
            else:
                # No subscription, or every one was gone.
                values = {"status": "dropped", "lease_until": None, "last_error": "no subscription"}
                summary.dropped += 1
            connection.execute(update(o).where(o.c.id == row.id).values(**values))
    summary.gone += len(gone)
