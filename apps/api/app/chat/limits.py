"""When a member may ask, and how many questions are left.

Limits are counted in the database (`piele.chat_turns`, one row per question, kept when a
thread is cleared), never in function memory, so every instance of the API agrees.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.engine import Connection

from app.config import Settings
from app.league import tables as t
from app.league.service import problem
from app.matchcentre.schedule import Fixture

OPENS_BEFORE_KICKOFF = timedelta(days=3)
DAY = timedelta(hours=24)


def is_open(fixture: Fixture, season_closed_at: datetime | None, now: datetime) -> bool:
    """From three days before kickoff until kickoff, when picks lock, while the season is open."""
    if fixture.kickoff_utc is None or (season_closed_at is not None and season_closed_at <= now):
        return False
    return fixture.kickoff_utc - OPENS_BEFORE_KICKOFF <= now < fixture.kickoff_utc


def lock_key(membership_id: UUID, fixture_id: str) -> str:
    return f"{membership_id}{fixture_id}"


def try_lock(connection: Connection, membership_id: UUID, fixture_id: str) -> bool:
    """A transaction-scoped advisory lock on the member's thread. It only spans the first
    short transaction (checks and the stored question), so it refuses a second send made at
    the same moment; a turn already streaming is caught by `store.in_flight`."""
    return connection.execute(
        text("select pg_try_advisory_xact_lock(hashtext(:key))"), {"key": lock_key(membership_id, fixture_id)}
    ).scalar_one()


@dataclass(frozen=True)
class Used:
    thread: int
    today: int
    everywhere: int


@dataclass(frozen=True)
class Remaining:
    thread: int
    today: int


def used(
    connection: Connection, league_id: UUID, membership_id: UUID, fixture_id: str, now: datetime, *, everywhere: bool = True
) -> Used:
    """Questions asked in this thread, by this member in this league in the last 24 hours, and
    (unless `everywhere` is false) across the deployment in the last 24 hours."""
    turns = t.chat_turns
    mine = (turns.c.league_id == league_id) & (turns.c.membership_id == membership_id)
    thread = connection.execute(
        select(func.count()).where(mine, turns.c.scope_kind == "fixture", turns.c.scope_key == fixture_id)
    ).scalar_one()
    today = connection.execute(
        select(func.count()).where(mine, turns.c.created_at > now - DAY, turns.c.created_at <= now)
    ).scalar_one()
    total = 0
    if everywhere:
        # Other leagues' rows are hidden from the runtime role; the function counts them all.
        total = connection.execute(text("select piele.chat_turns_last_day(:at)"), {"at": now}).scalar_one()
    return Used(thread, today, total)


def remaining(settings: Settings, counts: Used) -> Remaining:
    return Remaining(
        thread=max(0, settings.piele_chat_turns_per_thread - counts.thread),
        today=max(0, settings.piele_chat_turns_per_day - counts.today),
    )


def check(settings: Settings, counts: Used) -> None:
    """Refuse a question over a limit: 429 for the member's own limits, 503 for the
    deployment's daily cap."""
    if counts.thread >= settings.piele_chat_turns_per_thread:
        raise problem(429, "chat_thread_limit", "You have asked all the questions this match allows.")
    if counts.today >= settings.piele_chat_turns_per_day:
        raise problem(429, "chat_daily_limit", "You have asked all your questions for today. Try again tomorrow.")
    if counts.everywhere >= settings.piele_chat_turns_per_day_global:
        raise problem(503, "chat_capacity", "The Pavilion has answered all the questions it can today. Try again later.")
