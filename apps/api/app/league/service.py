"""League domain operations. Every mutation runs inside the actor's transaction and writes
its audit event and feed entry there, so the three commit or roll back together (I6)."""

import copy
import math
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Mapping, Sequence
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, case, func, insert, literal, or_, select, text, update
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from app import competitions
from app.competitions import Competition
from app.league import tables as t
from app.league.context import (
    ADMIN_LABEL,
    Account,
    Actor,
    active_season,
    actor_for,
    now_utc,
    require_membership,
    set_context,
)
from app.league.marks import MarkCalculation, calculate
from app.league.storage import Storage, StorageError
from app.matchcentre import milestones
from app.matchcentre.cache import external_snapshots
from app.matchcentre.providers import scores as score_feed
from app.matchcentre.schedule import Fixture
from app.matchcentre.service import round_scores_key

DUTY_TYPES = ("spoon", "pick_confirmation")
VIDEO_TYPES = ("video/",)


def problem(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@dataclass(frozen=True)
class FeedEntry:
    kind: str
    title: str
    detail: str = ""
    round_number: int | None = None
    subject_membership_id: UUID | None = None
    duty_id: UUID | None = None
    submission_id: UUID | None = None


def record(
    actor: Actor,
    *,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    reason: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    feed: FeedEntry | None = None,
) -> None:
    """Append the audit event and, when the change is league-visible, the feed entry. The
    admin acting without a membership is recorded with no actor membership and the label
    `admin`; the admin holding a membership is labelled `<name> (admin)`, so the audit trail
    shows the admin's powers were in play."""
    if actor.membership_id is None:
        actor_label = ADMIN_LABEL
    elif actor.is_admin:
        actor_label = f"{actor.display_name} ({ADMIN_LABEL})"
    else:
        actor_label = actor.display_name
    write_record(
        actor.connection,
        league_id=actor.league_id,
        season_id=actor.season_id,
        actor_membership_id=actor.membership_id,
        actor_label=actor_label,
        request_id=actor.request_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        reason=reason,
        before=before,
        after=after,
        feed=feed,
    )


def write_record(
    connection: Connection,
    *,
    league_id: UUID,
    season_id: UUID | None,
    actor_membership_id: UUID | None,
    actor_label: str,
    request_id: str | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    reason: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    feed: FeedEntry | None = None,
) -> None:
    """`record` without an actor, for the management centre, whose routes act on a league
    from outside it. Needs that league's context."""
    connection.execute(
        insert(t.audit_events).values(
            league_id=league_id,
            actor_membership_id=actor_membership_id,
            actor_label=actor_label,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            reason=reason,
            before=before,
            after=after,
            request_id=request_id,
        )
    )
    if feed is not None:
        connection.execute(
            insert(t.feed_entries).values(
                league_id=league_id,
                season_id=season_id,
                round_number=feed.round_number,
                kind=feed.kind,
                actor_membership_id=actor_membership_id,
                subject_membership_id=feed.subject_membership_id,
                duty_id=feed.duty_id,
                submission_id=feed.submission_id,
                title=feed.title,
                detail=feed.detail,
            )
        )


# Rounds -------------------------------------------------------------------------------


def default_deadline(competition: Competition, duty_type: str, round_number: int | None) -> datetime | None:
    """Spoon duties are due when the competition's next round kicks off. Other types need an
    explicit deadline."""
    if duty_type == "spoon" and round_number is not None and round_number < competition.last_round:
        return competition.first_kickoff(round_number + 1)
    return None


# Members ------------------------------------------------------------------------------


def members(actor: Actor, *, include_withdrawn: bool = False) -> Sequence[Any]:
    """The team sheet: active memberships, and withdrawn ones too when asked (the captain's
    desk). Members who left keep their history; a withdrawn row has no active season
    membership, so it is never in the season."""
    sm = t.season_memberships
    m = t.league_memberships
    statuses = ("active", "withdrawn") if include_withdrawn else ("active",)
    return actor.connection.execute(
        select(
            m.c.id,
            m.c.display_name,
            m.c.full_name,
            m.c.status,
            m.c.invited_email,
            m.c.user_id,
            m.c.left_at,
            m.c.withdrawal_reason,
            sm.c.id.label("season_membership_id"),
        )
        .select_from(
            m.outerjoin(
                sm, and_(sm.c.membership_id == m.c.id, sm.c.season_id == actor.season_id, sm.c.status == "active")
            )
        )
        .where(m.c.league_id == actor.league_id, m.c.status.in_(statuses))
        .order_by(m.c.full_name)
    ).all()


WITHDRAWN_DUTY_REASON = "Member withdrawn"


def withdraw_member(actor: Actor, membership_id: UUID, *, reason: str) -> bool:
    """Captain or admin removes a member. Returns True when the membership was withdrawn and
    False when it was deleted outright.

    A withdrawal keeps every record: the league membership and its active season membership
    end (`status = 'withdrawn'`, `left_at`, `effective_to`), the member's open and
    pending-deadline duties are voided, standings, evidence and marks stay. An unclaimed name
    with no records at all (a mistaken entry) is deleted instead and leaves no feed entry.
    The captain and the caller's own membership cannot be removed."""
    if membership_id == actor.captain_membership_id:
        raise problem(409, "captain_membership", "The captain cannot be removed. Appoint another captain first.")
    if actor.membership_id is not None and membership_id == actor.membership_id:
        raise problem(409, "own_membership", "You cannot remove yourself.")
    m, sm = t.league_memberships, t.season_memberships
    row = _league_membership(actor, membership_id)
    if row.status != "active":
        raise problem(409, "already_withdrawn", "That member has already been removed.")
    if row.user_id is None and _delete_if_record_free(actor, row):
        return False

    now = now_utc()
    actor.connection.execute(
        update(m)
        .where(m.c.id == membership_id, m.c.league_id == actor.league_id, m.c.version == row.version)
        .values(status="withdrawn", left_at=now, withdrawal_reason=reason, updated_at=func.now(), version=m.c.version + 1)
    )
    actor.connection.execute(
        update(sm)
        .where(sm.c.membership_id == membership_id, sm.c.season_id == actor.season_id, sm.c.status == "active")
        .values(status="withdrawn", effective_to=now, updated_at=func.now())
    )
    voided = _void_member_duties(actor, membership_id)
    record(
        actor,
        action="membership.withdrawn",
        entity_type="league_membership",
        entity_id=membership_id,
        reason=reason,
        before={"status": "active"},
        after={"status": "withdrawn", "leftAt": _iso(now), "voidedDutyIds": [str(duty_id) for duty_id in voided]},
        feed=FeedEntry(kind="member_left", title=f"{row.display_name} left the clubhouse.", subject_membership_id=membership_id),
    )
    return True


def _league_membership(actor: Actor, membership_id: UUID) -> Any:
    """The membership in the actor's league, locked, or 404 `unknown_member`. A membership id
    comes from the client, and the caller's own memberships in other leagues stay readable
    (the league list needs them), so the league is always part of the lookup."""
    m = t.league_memberships
    row = actor.connection.execute(
        select(m).where(m.c.id == membership_id, m.c.league_id == actor.league_id).with_for_update()
    ).first()
    if row is None:
        raise problem(404, "unknown_member", "Unknown member.")
    return row


def _void_member_duties(actor: Actor, membership_id: UUID) -> list[UUID]:
    """Voids the member's live duties in every season (open or waiting for a deadline) and
    supersedes their pending evidence, with one audit event per duty and no feed entry: the
    member_left entry says it once."""
    d, sm, links = t.duties, t.season_memberships, t.duty_evidence_links
    rows = actor.connection.execute(
        select(d.c.id, d.c.status)
        .select_from(d.join(sm, sm.c.id == d.c.season_membership_id))
        .where(
            d.c.league_id == actor.league_id,
            sm.c.membership_id == membership_id,
            d.c.status.in_(("open", "pending_deadline")),
        )
        .with_for_update(of=d)
    ).all()
    for duty in rows:
        actor.connection.execute(
            update(d)
            .where(d.c.id == duty.id)
            .values(
                status="voided",
                voided_at=func.now(),
                void_reason=WITHDRAWN_DUTY_REASON,
                updated_at=func.now(),
                version=d.c.version + 1,
            )
        )
        actor.connection.execute(
            update(links)
            .where(links.c.duty_id == duty.id, links.c.decision == "pending")
            .values(decision="superseded", updated_at=func.now(), version=links.c.version + 1)
        )
        record(
            actor,
            action="duty.voided",
            entity_type="duty",
            entity_id=duty.id,
            reason=WITHDRAWN_DUTY_REASON,
            before={"status": duty.status},
            after={"status": "voided"},
        )
    return [duty.id for duty in rows]


def _delete_if_record_free(actor: Actor, row: Any) -> bool:
    """Deletes an unclaimed name that nothing refers to: no duties, standings, picks or evidence,
    and no season membership beyond its one enrolment. Anything else that still points at
    it (a feed entry from an earlier claim, say) makes the delete fail on its foreign key,
    and the caller withdraws the name instead."""
    connection = actor.connection
    sm, d, rs, e = t.season_memberships, t.duties, t.round_standings, t.evidence_submissions
    enrolments = connection.execute(select(sm.c.id).where(sm.c.membership_id == row.id)).scalars().all()
    if len(enrolments) > 1:
        return False
    if enrolments:
        enrolment = enrolments[0]
        if connection.execute(select(d.c.id).where(d.c.season_membership_id == enrolment).limit(1)).first():
            return False
        if connection.execute(select(rs.c.id).where(rs.c.season_membership_id == enrolment).limit(1)).first():
            return False
        if connection.execute(select(t.picks.c.id).where(t.picks.c.season_membership_id == enrolment).limit(1)).first():
            return False
    evidence = connection.execute(
        select(e.c.id)
        .where(or_(e.c.submitter_membership_id == row.id, e.c.subject_membership_id == row.id))
        .limit(1)
    ).first()
    if evidence is not None:
        return False
    try:
        with connection.begin_nested():
            connection.execute(sm.delete().where(sm.c.membership_id == row.id, sm.c.league_id == actor.league_id))
            connection.execute(
                t.league_memberships.delete().where(
                    t.league_memberships.c.id == row.id, t.league_memberships.c.league_id == actor.league_id
                )
            )
    except IntegrityError:
        return False
    record(
        actor,
        action="membership.deleted",
        entity_type="league_membership",
        entity_id=row.id,
        before={"displayName": row.display_name, "fullName": row.full_name, "emailSet": row.invited_email is not None},
    )
    return True


def reinstate_member(actor: Actor, membership_id: UUID) -> None:
    """Captain or admin brings a withdrawn member back: the league membership is active again
    and the member is enrolled in the active season with a new season membership (the
    withdrawn one keeps its effective_to, which marks the gap)."""
    m, sm = t.league_memberships, t.season_memberships
    row = _league_membership(actor, membership_id)
    if row.status != "withdrawn":
        raise problem(409, "not_withdrawn", "That member has not been removed.")
    actor.connection.execute(
        update(m)
        .where(m.c.id == membership_id, m.c.league_id == actor.league_id, m.c.version == row.version)
        .values(status="active", left_at=None, withdrawal_reason=None, updated_at=func.now(), version=m.c.version + 1)
    )
    actor.connection.execute(
        insert(sm).values(league_id=actor.league_id, season_id=actor.season_id, membership_id=membership_id)
    )
    record(
        actor,
        action="membership.reinstated",
        entity_type="league_membership",
        entity_id=membership_id,
        before={"status": "withdrawn", "leftAt": _iso(row.left_at), "withdrawalReason": row.withdrawal_reason},
        after={"status": "active"},
        feed=FeedEntry(kind="member_returned", title=f"{row.display_name} is back.", subject_membership_id=membership_id),
    )


# Leagues, accounts and joining -----------------------------------------------------------

# 3 to 40 characters, as the message says. The database constraint also allows one character.
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$")
# Top-level web routes that a league slug must never shadow (apps/web/src/app/app.routes.ts).
RESERVED_SLUGS = frozenset(
    {"sign-in", "join", "no-league", "manage", "standings", "duties", "decisions", "constitution", "captain", "more", "profile", "welcome", "match", "api", "v1"}
)
ACCENT_PATTERN = re.compile(r"^#[0-9a-f]{6}$")
JOIN_CODE_PATTERN = re.compile(r"^[a-z0-9]{4,16}$")


def create_league(
    connection: Connection,
    *,
    name: str,
    slug: str,
    timezone: str,
    competition_id: str,
    season_name: str,
    members: Sequence[dict[str, str]],
    captain_display_name: str,
    captain_email: str,
    actor_label: str,
    emblem_path: str | None = None,
    accent_colour: str | None = None,
    request_id: str | None = None,
    rules: Mapping[str, Any] | None = None,
) -> UUID:
    """Creates a league, its memberships (`members` are `{fullName, displayName}`), the
    captain's membership reserved for `captain_email`, the first season on the competition
    (with `rules`, any subset of the Superbru rules, over DEFAULT_RULES) and its season
    memberships, in the caller's transaction. Used by the operator bootstrap and the admin's
    management centre (`create_admin_league`). New leagues get a join code. Leaves the new
    league's context set."""
    if not SLUG_PATTERN.fullmatch(slug):
        raise problem(422, "invalid_slug", "Use 3 to 40 lower-case letters, digits and hyphens for the slug.")
    if slug in RESERVED_SLUGS:
        raise problem(422, "invalid_slug", f"The slug {slug!r} is reserved.")
    if competition_id not in competitions.ALL:
        raise problem(
            422, "unknown_competition", f"Unknown competition {competition_id!r}; known: {', '.join(competitions.ALL)}."
        )
    competition = competitions.get(competition_id)
    known_zone = connection.execute(
        text("select exists (select 1 from pg_timezone_names where name = :tz)"), {"tz": timezone}
    ).scalar_one()
    if not known_zone:
        raise problem(422, "invalid_timezone", f"Unknown time zone {timezone!r}.")
    if accent_colour is not None and not ACCENT_PATTERN.fullmatch(accent_colour):
        raise problem(422, "invalid_accent_colour", "Use a colour like #1a2b3c.")
    # A new league has no uploads yet, so its emblem can only be a preset.
    if emblem_path is not None and emblem_preset(emblem_path) not in EMBLEM_PRESETS:
        raise problem(422, "invalid_emblem", "Choose one of the preset emblems.")
    names = [member["displayName"] for member in members]
    if not names or len(set(names)) != len(names):
        raise problem(422, "duplicate_member", "Each member needs a different display name.")
    if captain_display_name not in names:
        raise problem(422, "unknown_captain", "The captain must be one of the members.")
    change = check_rules_change(rules or {}, competition)
    if change.get(PREVIOUS_CHAMPION) is not None:
        raise problem(422, "invalid_rules", "A new league has no previous champion yet; set one once it exists.")
    season_rules_stored = stored_rules(apply_rules_change(merge_rules(None, None), change))

    league_id = uuid4()
    # Leagues are writable only inside their own context, so set it before inserting.
    set_context(connection, "league_id", str(league_id))
    memberships = {member["displayName"]: uuid4() for member in members}
    captain_id = memberships[captain_display_name]
    try:
        with connection.begin_nested():
            connection.execute(
                insert(t.leagues).values(
                    id=league_id,
                    name=name,
                    slug=slug,
                    timezone=timezone,
                    captain_membership_id=captain_id,
                    emblem_path=emblem_path,
                    accent_colour=accent_colour,
                    join_code=secrets.token_hex(6),
                )
            )
    except IntegrityError as exc:
        raise problem(409, "slug_taken", f"A league with the slug {slug!r} already exists.") from exc
    for member in members:
        is_captain = member["displayName"] == captain_display_name
        connection.execute(
            insert(t.league_memberships).values(
                id=memberships[member["displayName"]],
                league_id=league_id,
                display_name=member["displayName"],
                full_name=member["fullName"],
                invited_email=captain_email.lower() if is_captain else None,
            )
        )
    season_id = connection.execute(
        insert(t.seasons)
        .values(
            league_id=league_id,
            name=season_name,
            competition=competition.name[:80],
            competition_id=competition.id,
            status="active",
            rules=season_rules_stored,
        )
        .returning(t.seasons.c.id)
    ).scalar_one()
    for membership_id in memberships.values():
        connection.execute(
            insert(t.season_memberships).values(league_id=league_id, season_id=season_id, membership_id=membership_id)
        )
    connection.execute(
        insert(t.audit_events).values(
            league_id=league_id,
            actor_label=actor_label,
            action="league.created",
            entity_type="league",
            entity_id=league_id,
            after={
                "name": name,
                "slug": slug,
                "members": len(memberships),
                "season": season_name,
                "competitionId": competition.id,
                "rules": season_rules_stored,
            },
            request_id=request_id,
        )
    )
    connection.execute(
        insert(t.feed_entries).values(
            league_id=league_id,
            season_id=season_id,
            kind="season_opened",
            title=f"{season_name} is open.",
            detail=f"{len(memberships)} members enrolled. {captain_display_name} is captain.",
        )
    )
    return league_id


@dataclass(frozen=True)
class LeagueSummary:
    """A league as the account sees it: the league row, its active season and competition,
    and the caller's membership there (None for the admin's view of another league)."""

    league: Any
    season: Any
    competition: Competition
    membership: Any | None
    in_season: bool


def league_summary(connection: Connection, league: Any, membership: Any | None) -> LeagueSummary | None:
    """Sets the league context to read the league's active season. None without one."""
    set_context(connection, "league_id", str(league.id))
    season = active_season(connection, league.id)
    if season is None or season.competition_id not in competitions.ALL:
        return None
    in_season = False
    if membership is not None:
        sm = t.season_memberships
        in_season = (
            connection.execute(
                select(sm.c.id).where(
                    sm.c.season_id == season.id, sm.c.membership_id == membership.id, sm.c.status == "active"
                )
            ).first()
            is not None
        )
    return LeagueSummary(league, season, competitions.get(season.competition_id), membership, in_season)


def account_leagues(account: Account) -> list[LeagueSummary]:
    """Claims every name reserved for the account's verified email, then lists the active
    leagues it belongs to by name, followed for the admin by every other active league."""
    claim_reserved(account)
    connection = account.connection
    set_context(connection, "league_id", None)
    m, lg = t.league_memberships, t.leagues
    memberships = {
        row.league_id: row
        for row in connection.execute(select(m).where(m.c.user_id == account.user_id, m.c.status == "active")).all()
    }
    # Row level security shows the leagues the account belongs to, or every league to the admin.
    leagues = connection.execute(select(lg).where(lg.c.status == "active").order_by(lg.c.name, lg.c.slug)).all()
    own = [league for league in leagues if league.id in memberships]
    others = [league for league in leagues if league.id not in memberships] if account.is_admin else []
    summaries = []
    try:
        for league in own + others:
            summary = league_summary(connection, league, memberships.get(league.id))
            if summary is not None:
                summaries.append(summary)
    finally:
        set_context(connection, "league_id", None)
    return summaries


def claim_reserved(account: Account) -> None:
    """A verified sign-in claims each name reserved for its address, once per league, unless
    the account already holds a membership in that league."""
    email = account.verified_email
    if email is None:
        return
    m = t.league_memberships
    reserved = account.connection.execute(
        select(m.c.id, m.c.league_id)
        .where(m.c.user_id.is_(None), m.c.status == "active", func.lower(m.c.invited_email) == email)
        .order_by(m.c.joined_at)
    ).all()
    for row in reserved:
        try:
            _claim(account, row.league_id, row.id, reserved_ok=True)
        except HTTPException as exc:
            # A concurrent request from the same account took a name in that league first.
            if not (isinstance(exc.detail, dict) and exc.detail.get("code") == "already_member"):
                raise
    set_context(account.connection, "league_id", None)


def league_by_join_code(connection: Connection, code: str) -> Any:
    """The active league with this join code, or 404 `unknown_join_code`. The code opens only
    that league (the `leagues_join_code` policy); the caller sets the league context next."""
    code = code.strip().lower()
    league = None
    if JOIN_CODE_PATTERN.fullmatch(code):
        set_context(connection, "join_code", code)
        league = connection.execute(
            select(t.leagues).where(t.leagues.c.join_code == code, t.leagues.c.status == "active")
        ).first()
        set_context(connection, "join_code", None)
    if league is None:
        raise problem(404, "unknown_join_code", "That join code does not open a league. Check it with your captain.")
    return league


@dataclass(frozen=True)
class JoinView:
    summary: LeagueSummary
    already_member: bool
    unclaimed: Sequence[Any]


def join_view(account: Account, code: str) -> JoinView:
    """What a join code shows: the league, whether the caller already belongs to it, and the
    names the caller may claim there (unclaimed and unreserved, or reserved for their
    verified email)."""
    connection = account.connection
    league = league_by_join_code(connection, code)
    m = t.league_memberships
    set_context(connection, "league_id", str(league.id))
    own = connection.execute(
        select(m).where(m.c.league_id == league.id, m.c.user_id == account.user_id, m.c.status == "active")
    ).first()
    summary = league_summary(connection, league, own)
    if summary is None:
        raise problem(409, "no_active_season", "No active season.")
    email = account.verified_email
    claimable = m.c.invited_email.is_(None)
    if email is not None:
        claimable = or_(claimable, func.lower(m.c.invited_email) == email)
    unclaimed = connection.execute(
        select(m.c.id, m.c.display_name, m.c.full_name)
        .where(m.c.league_id == league.id, m.c.user_id.is_(None), m.c.status == "active", claimable)
        .order_by(m.c.full_name)
    ).all()
    return JoinView(summary, own is not None, unclaimed)


def join(account: Account, code: str, membership_id: UUID) -> Actor:
    """Claims one name in the league the code opens and returns the caller as its member."""
    connection = account.connection
    league = league_by_join_code(connection, code)
    m = t.league_memberships
    set_context(connection, "league_id", str(league.id))
    existing = connection.execute(
        select(m.c.status).where(m.c.league_id == league.id, m.c.user_id == account.user_id)
    ).first()
    if existing is not None and existing.status == "active":
        raise problem(409, "already_member", "You are already a member of this league.")
    if existing is not None:
        raise problem(409, "withdrawn_member", "You left this league. Ask its captain to reinstate you.")
    target = connection.execute(select(m).where(m.c.id == membership_id, m.c.league_id == league.id)).first()
    if target is None or target.status != "active" or target.user_id is not None:
        raise problem(409, "name_taken", "That name is no longer available. Choose another.")
    if target.invited_email is not None and target.invited_email.lower() != account.verified_email:
        raise problem(403, "reserved", "That name is reserved for another email address.")
    actor = _claim(account, league.id, membership_id, reserved_ok=target.invited_email is not None)
    if actor is None:
        raise problem(409, "name_taken", "That name is no longer available. Choose another.")
    return actor


def _claim(account: Account, league_id: UUID, membership_id: UUID, *, reserved_ok: bool) -> Actor | None:
    """Binds the account to an unclaimed name in an active league, copying the favourite team
    from the account's membership in another league on the same competition, and records
    `membership.claimed` with the `member_joined` feed entry. None when the name was taken
    meanwhile, the league is not active, or the account already has a membership there;
    409 `already_member` when a concurrent request claimed another name in the league for
    the same account after the check here."""
    connection = account.connection
    m = t.league_memberships
    set_context(connection, "league_id", str(league_id))
    league = connection.execute(
        select(t.leagues.c.id).where(t.leagues.c.id == league_id, t.leagues.c.status == "active")
    ).first()
    season = active_season(connection, league_id)
    if league is None or season is None:
        return None
    if connection.execute(select(m.c.id).where(m.c.league_id == league_id, m.c.user_id == account.user_id)).first():
        return None
    team = _team_on_competition(account, season.competition_id, exclude_league_id=league_id)
    set_context(connection, "league_id", str(league_id))
    condition = m.c.invited_email.is_(None)
    if reserved_ok and account.verified_email is not None:
        condition = or_(condition, func.lower(m.c.invited_email) == account.verified_email)
    values: dict[str, Any] = {"user_id": account.user_id, "updated_at": func.now(), "version": m.c.version + 1}
    if team is not None:
        values["favourite_team_id"] = func.coalesce(m.c.favourite_team_id, team)
    try:
        with connection.begin_nested():
            claimed = connection.execute(
                update(m)
                .where(
                    m.c.id == membership_id, m.c.league_id == league_id, m.c.user_id.is_(None), m.c.status == "active", condition
                )
                .values(**values)
                .returning(m.c.display_name)
            ).first()
    except IntegrityError as exc:
        if _constraint(exc) != ONE_MEMBERSHIP_PER_LEAGUE:
            raise
        raise problem(409, "already_member", "You are already a member of this league.") from exc
    if claimed is None:
        return None
    actor = actor_for(account, league_id)
    record(
        actor,
        action="membership.claimed",
        entity_type="league_membership",
        entity_id=membership_id,
        feed=FeedEntry(kind="member_joined", title=f"{claimed.display_name} joined the clubhouse."),
    )
    return actor


ONE_MEMBERSHIP_PER_LEAGUE = "league_memberships_league_id_user_id_key"


def _constraint(exc: IntegrityError) -> str | None:
    """The name of the constraint an IntegrityError broke, when the driver reports it."""
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None)


def _team_on_competition(account: Account, competition_id: str, *, exclude_league_id: UUID) -> str | None:
    """The favourite team of the account's most recently updated membership in another
    league on the same competition, if any. Changes the league context."""
    m = t.league_memberships
    connection = account.connection
    set_context(connection, "league_id", None)
    candidates = connection.execute(
        select(m.c.league_id, m.c.favourite_team_id)
        .where(
            m.c.user_id == account.user_id,
            m.c.status == "active",
            m.c.favourite_team_id.is_not(None),
            m.c.league_id != exclude_league_id,
        )
        .order_by(m.c.updated_at.desc())
    ).all()
    competition = competitions.ALL.get(competition_id)
    for row in candidates:
        set_context(connection, "league_id", str(row.league_id))
        season = active_season(connection, row.league_id)
        if season is not None and season.competition_id == competition_id and competition and competition.club(row.favourite_team_id):
            return row.favourite_team_id
    return None


def last_league_id(account: Account) -> UUID | None:
    return account.connection.execute(
        select(t.users.c.last_league_id).where(t.users.c.id == account.user_id)
    ).scalar_one()


def record_last_league(actor: Actor) -> None:
    """Remembers the league the account opened last, so a fresh device lands there."""
    actor.connection.execute(
        update(t.users).where(t.users.c.id == actor.user_id).values(last_league_id=actor.league_id, updated_at=func.now())
    )


def release_membership(actor: Actor, membership_id: UUID) -> None:
    """Captain or admin undoes a claim so the right account can take the name. Not for the
    captain's own membership. The claimant's team and notification read state go with them,
    so the next claimant starts clean."""
    if membership_id == actor.captain_membership_id:
        raise problem(409, "captain_membership", "The captain's own membership cannot be released.")
    m = t.league_memberships
    row = _league_membership(actor, membership_id)
    if row.user_id is None:
        raise problem(409, "not_claimed", "That name has not been claimed.")
    actor.connection.execute(
        update(m)
        .where(m.c.id == membership_id, m.c.league_id == actor.league_id, m.c.version == row.version)
        .values(
            user_id=None,
            favourite_team_id=None,
            notifications_read_at=None,
            notifications_read_keys=[],
            updated_at=func.now(),
            version=m.c.version + 1,
        )
    )
    record(
        actor,
        action="membership.released",
        entity_type="league_membership",
        entity_id=membership_id,
        before={"claimed": True},
        after={"claimed": False},
    )


def add_member(actor: Actor, *, display_name: str, full_name: str, email: str | None) -> UUID:
    m = t.league_memberships
    try:
        membership_id = actor.connection.execute(
            insert(m)
            .values(
                league_id=actor.league_id,
                display_name=display_name,
                full_name=full_name,
                invited_email=email.lower() if email else None,
            )
            .returning(m.c.id)
        ).scalar_one()
    except IntegrityError as exc:
        raise problem(409, "duplicate_email", "Another member already has that email address.") from exc
    actor.connection.execute(
        insert(t.season_memberships).values(
            league_id=actor.league_id, season_id=actor.season_id, membership_id=membership_id
        )
    )
    record(
        actor,
        action="membership.created",
        entity_type="league_membership",
        entity_id=membership_id,
        after={"displayName": display_name, "fullName": full_name, "emailSet": bool(email)},
        feed=FeedEntry(kind="member_added", title=f"{display_name} was added to the league."),
    )
    return membership_id


def update_member(
    actor: Actor, membership_id: UUID, *, display_name: str | None, email: str | None, clear_email: bool
) -> None:
    m = t.league_memberships
    current = _league_membership(actor, membership_id)
    values: dict[str, Any] = {}
    if display_name is not None:
        values["display_name"] = display_name
    if clear_email:
        values["invited_email"] = None
    elif email is not None:
        values["invited_email"] = email.lower()
    if not values:
        return
    try:
        actor.connection.execute(
            update(m)
            .where(m.c.id == membership_id, m.c.league_id == actor.league_id)
            .values(**values, updated_at=func.now(), version=m.c.version + 1)
        )
    except IntegrityError as exc:
        raise problem(409, "duplicate_email", "Another member already has that email address.") from exc
    record(
        actor,
        action="membership.updated",
        entity_type="league_membership",
        entity_id=membership_id,
        before={"displayName": current.display_name, "emailSet": current.invited_email is not None},
        after={"displayName": values.get("display_name", current.display_name), "emailSet": "invited_email" in values and values["invited_email"] is not None or ("invited_email" not in values and current.invited_email is not None)},
    )


# Emblem, accent colour and join code (captain or admin) ---------------------------------

# The web ships each preset as assets/images/emblems/<key>.svg; stored as 'preset:<key>'.
EMBLEM_PRESETS = ("ball", "posts", "jersey", "boot", "scrum", "wings", "trophy")
PRESET_PREFIX = "preset:"
EMBLEM_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_UNSET: Any = object()


def emblem_preset(emblem_path: str | None) -> str | None:
    """The preset key of a stored emblem, or None for an upload or no emblem."""
    if emblem_path and emblem_path.startswith(PRESET_PREFIX):
        return emblem_path[len(PRESET_PREFIX):]
    return None


def emblem_url(storage: Storage, emblem_path: str | None, url_ttl_seconds: int) -> str | None:
    """A signed URL for an uploaded emblem, or None for a preset, no emblem, or Storage
    trouble (the web then shows the default crest or monogram)."""
    if not emblem_path or emblem_path.startswith(PRESET_PREFIX):
        return None
    try:
        return storage.signed_url(emblem_path, url_ttl_seconds)
    except StorageError:
        return None


def _emblem_prefix(league_id: UUID) -> str:
    return f"emblems/{league_id}/"


def _is_image(ext: str, head: bytes) -> bool:
    """The object's first bytes, not the uploader's claim, decide its type."""
    if ext == "jpg":
        return head[:3] == b"\xff\xd8\xff"
    if ext == "png":
        return head[:8] == b"\x89PNG\r\n\x1a\n"
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def reserve_emblem_upload(actor: Actor, storage: Storage, *, content_type: str, size_bytes: int, max_bytes: int) -> dict[str, Any]:
    """A signed upload for a new emblem at a fresh path under the league's emblem prefix."""
    ext = EMBLEM_TYPES.get(content_type)
    if ext is None:
        raise problem(422, "not_an_image", "Choose a JPEG, PNG or WebP image.")
    if size_bytes <= 0 or size_bytes > max_bytes:
        raise problem(422, "too_large", f"Choose an image smaller than {max_bytes // 1024} KB.")
    path = f"{_emblem_prefix(actor.league_id)}{secrets.token_hex(16)}.{ext}"
    try:
        grant = storage.create_signed_upload(path)
    except StorageError as exc:
        raise problem(503, "storage_unavailable", "Emblem storage is unavailable. Try again later.") from exc
    return {"bucket": storage.bucket, "path": path, "token": grant.token}


def update_appearance(
    actor: Actor,
    storage: Storage,
    *,
    emblem_preset_key: Any = _UNSET,
    emblem_path: Any = _UNSET,
    accent_colour: Any = _UNSET,
    max_bytes: int,
) -> None:
    """Sets the league's emblem (a preset, an upload, or none) and accent colour. Arguments
    left unset are untouched; a preset and an upload cannot both be given. Setting one clears
    the other, and a replaced upload is deleted from Storage."""
    if emblem_preset_key is not _UNSET and emblem_path is not _UNSET:
        raise problem(422, "invalid_emblem", "Choose a preset or an uploaded emblem, not both.")
    lg = t.leagues
    league = actor.connection.execute(
        select(lg.c.emblem_path, lg.c.accent_colour, lg.c.version).where(lg.c.id == actor.league_id).with_for_update()
    ).one()
    new_path = league.emblem_path
    if emblem_preset_key is not _UNSET:
        if emblem_preset_key is not None and emblem_preset_key not in EMBLEM_PRESETS:
            raise problem(422, "invalid_emblem", "Choose one of the preset emblems.")
        new_path = f"{PRESET_PREFIX}{emblem_preset_key}" if emblem_preset_key is not None else None
    elif emblem_path is not _UNSET:
        new_path = emblem_path
        if emblem_path is not None and emblem_path != league.emblem_path:
            _check_emblem_upload(actor, storage, emblem_path, max_bytes)
    new_accent = league.accent_colour
    if accent_colour is not _UNSET:
        new_accent = accent_colour.lower() if accent_colour is not None else None
        if new_accent is not None and not ACCENT_PATTERN.fullmatch(new_accent):
            raise problem(422, "invalid_accent_colour", "Use a colour like #1a2b3c.")

    emblem_changed = new_path != league.emblem_path
    if not emblem_changed and new_accent == league.accent_colour:
        return
    actor.connection.execute(
        update(lg)
        .where(lg.c.id == actor.league_id, lg.c.version == league.version)
        .values(emblem_path=new_path, accent_colour=new_accent, version=lg.c.version + 1)
    )
    record(
        actor,
        action="league.appearance_updated",
        entity_type="league",
        entity_id=actor.league_id,
        before={"emblem": _emblem_label(league.emblem_path), "accentColour": league.accent_colour},
        after={"emblem": _emblem_label(new_path), "accentColour": new_accent},
        feed=FeedEntry(kind="emblem_updated", title=f"The {actor.league_name} emblem was updated.") if emblem_changed else None,
    )
    actor.league_emblem_path, actor.league_accent_colour = new_path, new_accent
    if emblem_changed and league.emblem_path and not league.emblem_path.startswith(PRESET_PREFIX):
        _discard(storage, league.emblem_path)


def _check_emblem_upload(actor: Actor, storage: Storage, path: str, max_bytes: int) -> None:
    """An emblem must be an image uploaded under this league's prefix with a grant from
    `reserve_emblem_upload`, within the size limit and of the type its name says, both by its
    first bytes and by the content type Storage serves it with (a PNG stored as text/html
    would be served as a page)."""
    pattern = rf"{re.escape(_emblem_prefix(actor.league_id))}[0-9a-f]{{32}}\.(jpg|png|webp)"
    match = re.fullmatch(pattern, path)
    if match is None:
        raise problem(422, "unknown_upload", "Unknown emblem upload.")
    try:
        stored = storage.stored_object(path)
        if stored is None:
            raise problem(422, "unknown_upload", "The emblem upload did not finish. Try again.")
        head = storage.read_prefix(path, 12)
    except StorageError as exc:
        raise problem(503, "storage_unavailable", "Emblem storage is unavailable. Try again later.") from exc
    ext = match.group(1)
    served_as = (stored.content_type or "").split(";")[0].strip().lower()
    if (
        not _is_image(ext, head)
        or EMBLEM_TYPES.get(served_as) != ext
        or stored.size_bytes is None
        or stored.size_bytes > max_bytes
    ):
        _discard(storage, path)
        raise problem(422, "invalid_emblem", "That image could not be used. Choose a different image.")


def _emblem_label(emblem_path: str | None) -> str | None:
    """How the audit trail names an emblem: the preset, 'upload', or None."""
    if emblem_path is None:
        return None
    return emblem_path if emblem_path.startswith(PRESET_PREFIX) else "upload"


def rotate_join_code(actor: Actor) -> str:
    """Issues a new join code (twelve hex characters), which also opens a closed league to
    joining. The old code stops working at once."""
    lg = t.leagues
    before = actor.connection.execute(select(lg.c.join_code).where(lg.c.id == actor.league_id).with_for_update()).scalar_one()
    for _ in range(3):
        code = secrets.token_hex(6)
        try:
            with actor.connection.begin_nested():
                actor.connection.execute(
                    update(lg).where(lg.c.id == actor.league_id).values(join_code=code, version=lg.c.version + 1)
                )
            break
        except IntegrityError:
            continue
    else:
        raise problem(503, "join_code_unavailable", "Could not issue a new join code. Try again.")
    # The code opens the league's names, so the audit trail records only whether joining is open.
    record(
        actor,
        action="league.join_code_rotated",
        entity_type="league",
        entity_id=actor.league_id,
        before={"open": before is not None},
        after={"open": True},
    )
    actor.league_join_code = code
    return code


def close_join_code(actor: Actor) -> None:
    """Closes the league to joining by code. Reserved names still claim on sign-in."""
    lg = t.leagues
    before = actor.connection.execute(select(lg.c.join_code).where(lg.c.id == actor.league_id).with_for_update()).scalar_one()
    actor.connection.execute(update(lg).where(lg.c.id == actor.league_id).values(join_code=None, version=lg.c.version + 1))
    record(
        actor,
        action="league.join_code_closed",
        entity_type="league",
        entity_id=actor.league_id,
        before={"open": before is not None},
        after={"open": False},
    )
    actor.league_join_code = None


# Management centre (admin only) ----------------------------------------------------------
#
# The admin acts on leagues from outside them: every league is readable through the
# `leagues_admin` policy, and each operation sets the league's context before it reads its
# season and members or writes anything. Audit events carry the label `admin` and, when the
# admin holds a membership in that league, its id.

ADMIN_DISPLAY_NAME = "Admin"


@dataclass(frozen=True)
class AdminLeagueCounts:
    members: int
    claimed: int
    in_season: int
    withdrawn: int


@dataclass(frozen=True)
class AdminCaptainView:
    id: UUID
    display_name: str
    user_id: UUID | None


@dataclass(frozen=True)
class AdminLeagueView:
    """A league as the management centre lists it, archived or not."""

    league: Any
    # The active season, or None; `competition_id` comes from it or the latest season.
    season: Any | None
    competition_id: str
    competition: Competition | None
    captain: AdminCaptainView | None
    counts: AdminLeagueCounts
    my_member_id: UUID | None
    # The Superbru rules of the active season, else of the latest one, else the defaults.
    rules: dict[str, Any]


def admin_leagues(account: Account) -> list[AdminLeagueView]:
    """Every league, archived included: active first, then by name."""
    connection = account.connection
    set_context(connection, "league_id", None)
    lg = t.leagues
    leagues = connection.execute(
        select(lg).order_by(case((lg.c.status == "active", 0), else_=1), lg.c.name, lg.c.slug)
    ).all()
    try:
        return [_admin_view(account, league) for league in leagues]
    finally:
        set_context(connection, "league_id", None)


def admin_league(account: Account, league_id: UUID) -> AdminLeagueView:
    """One league as the management centre shows it. Leaves its context set."""
    return _admin_view(account, _admin_target(account, league_id))


def _admin_target(account: Account, league_id: UUID, *, for_update: bool = False) -> Any:
    """The league in any status, with its context set, or 404 `unknown_league`."""
    set_context(account.connection, "league_id", str(league_id))
    query = select(t.leagues).where(t.leagues.c.id == league_id)
    league = account.connection.execute(query.with_for_update() if for_update else query).first()
    if league is None:
        raise problem(404, "unknown_league", "Unknown league.")
    return league


def _admin_view(account: Account, league: Any) -> AdminLeagueView:
    """Three round trips per league: its context, its season, and the counts."""
    connection = account.connection
    set_context(connection, "league_id", str(league.id))
    m, sm, s = t.league_memberships, t.season_memberships, t.seasons
    # The active season, else the latest one for its competition.
    season = connection.execute(
        select(s)
        .where(s.c.league_id == league.id)
        .order_by((s.c.status == "active").desc(), s.c.created_at.desc())
        .limit(1)
    ).first()
    active = season if season is not None and season.status == "active" else None

    def count(*conditions: Any) -> Any:
        return select(func.count()).select_from(m).where(m.c.league_id == league.id, *conditions).scalar_subquery()

    in_season = (
        select(func.count())
        .select_from(sm.join(m, m.c.id == sm.c.membership_id))
        .where(sm.c.season_id == active.id, sm.c.status == "active", m.c.status == "active")
        .scalar_subquery()
        if active is not None
        else literal(0)
    )

    def captain(column: Any) -> Any:
        return select(column).where(m.c.id == league.captain_membership_id).scalar_subquery()

    row = connection.execute(
        select(
            count(m.c.status == "active").label("members"),
            count(m.c.status == "active", m.c.user_id.is_not(None)).label("claimed"),
            count(m.c.status == "withdrawn").label("withdrawn"),
            in_season.label("in_season"),
            select(m.c.id)
            .where(m.c.league_id == league.id, m.c.user_id == account.user_id, m.c.status == "active")
            .scalar_subquery()
            .label("my_member_id"),
            captain(m.c.id).label("captain_id"),
            captain(m.c.display_name).label("captain_name"),
            captain(m.c.user_id).label("captain_user_id"),
        )
    ).one()
    competition_id = season.competition_id if season is not None else ""
    return AdminLeagueView(
        league=league,
        season=active,
        competition_id=competition_id,
        competition=competitions.ALL.get(competition_id),
        captain=AdminCaptainView(row.captain_id, row.captain_name, row.captain_user_id) if row.captain_id is not None else None,
        counts=AdminLeagueCounts(row.members, row.claimed, row.in_season, row.withdrawn),
        my_member_id=row.my_member_id,
        rules=season_rules(season) if season is not None else merge_rules(None, None),
    )


def _admin_membership_id(account: Account, league_id: UUID) -> UUID | None:
    """The admin's active membership in the league, if any."""
    m = t.league_memberships
    return account.connection.execute(
        select(m.c.id).where(m.c.league_id == league_id, m.c.user_id == account.user_id, m.c.status == "active")
    ).scalar_one_or_none()


def _admin_record(account: Account, league_id: UUID, **kwargs: Any) -> None:
    """Audit (and feed) for an admin action in the league whose context is set."""
    season = active_season(account.connection, league_id)
    write_record(
        account.connection,
        league_id=league_id,
        season_id=season.id if season is not None else None,
        actor_membership_id=_admin_membership_id(account, league_id),
        actor_label=ADMIN_LABEL,
        request_id=account.request_id,
        **kwargs,
    )


def create_admin_league(
    account: Account,
    *,
    name: str,
    slug: str,
    timezone: str | None,
    competition_id: str,
    season_name: str,
    members: Sequence[dict[str, str]],
    captain_display_name: str,
    captain_email: str | None,
    emblem_preset_key: str | None,
    accent_colour: str | None,
    add_me: bool,
    rules: Mapping[str, Any] | None = None,
) -> UUID:
    """`create_league` for the admin. A null captain email (or the admin's own verified
    address) makes the admin the captain: the captain's name is reserved for that address and
    claimed at once, in season. Otherwise `add_me` adds the admin as a member outside the
    season, as `add_admin_membership` does. `rules` is any subset of the Superbru rules."""
    own_email = account.verified_email
    captain_is_me = captain_email is None or (own_email is not None and captain_email.lower() == own_email)
    if captain_is_me and own_email is None:
        raise problem(422, "unverified_email", "Sign in with a verified email address to captain a league yourself.")
    competition = competitions.ALL.get(competition_id)
    connection = account.connection
    league_id = create_league(
        connection,
        name=name,
        slug=slug,
        timezone=timezone or (competition.timezone if competition is not None else "Africa/Johannesburg"),
        competition_id=competition_id,
        season_name=season_name,
        members=members,
        captain_display_name=captain_display_name,
        captain_email=own_email if captain_is_me else captain_email,
        actor_label=ADMIN_LABEL,
        emblem_path=f"{PRESET_PREFIX}{emblem_preset_key}" if emblem_preset_key is not None else None,
        accent_colour=accent_colour.lower() if accent_colour is not None else None,
        request_id=account.request_id,
        rules=rules,
    )
    if captain_is_me:
        _claim_as_admin(account, league_id)
    elif add_me:
        add_admin_membership(account, league_id, display_name=None, full_name=None)
    set_context(connection, "league_id", str(league_id))
    return league_id


def _claim_as_admin(account: Account, league_id: UUID) -> None:
    """Binds the new league's captain membership (reserved for the admin's verified email) to
    the admin's account, copying the team from the admin's membership on the competition."""
    connection = account.connection
    season = active_season(connection, league_id)
    team = _team_on_competition(account, season.competition_id, exclude_league_id=league_id)
    set_context(connection, "league_id", str(league_id))
    m = t.league_memberships
    captain_id = connection.execute(select(t.leagues.c.captain_membership_id).where(t.leagues.c.id == league_id)).scalar_one()
    claimed = connection.execute(
        update(m)
        .where(m.c.id == captain_id, m.c.league_id == league_id, m.c.user_id.is_(None))
        .values(user_id=account.user_id, favourite_team_id=team, updated_at=func.now(), version=m.c.version + 1)
        .returning(m.c.display_name)
    ).one()
    _admin_record(
        account,
        league_id,
        action="membership.claimed",
        entity_type="league_membership",
        entity_id=captain_id,
        feed=FeedEntry(kind="member_joined", title=f"{claimed.display_name} joined the clubhouse."),
    )


def update_admin_league(
    account: Account,
    league_id: UUID,
    *,
    name: str | None,
    timezone: str | None,
    status: str | None,
    rules: Mapping[str, Any] | None = None,
) -> None:
    """Renames the league, changes its time zone, archives or restores it, or changes its
    active season's Superbru rules (any subset). Archiving keeps every row; restoring tells
    the league it is open again."""
    connection = account.connection
    league = _admin_target(account, league_id, for_update=True)
    if rules:
        season = _season_for_update(connection, league_id)
        if season is None:
            raise problem(409, "no_active_season", "No active season.")
        competition = competitions.ALL.get(season.competition_id)
        if competition is None:
            raise problem(409, "unknown_competition", "This season's competition is not supported.")
        changed = _save_rules(connection, league_id, season, rules, competition)
        if changed is not None:
            _admin_record(account, league_id, **_rules_record(season.id, *changed))
    details: dict[str, Any] = {}
    if name is not None and name != league.name:
        details["name"] = name
    if timezone is not None and timezone != league.timezone:
        known_zone = connection.execute(
            text("select exists (select 1 from pg_timezone_names where name = :tz)"), {"tz": timezone}
        ).scalar_one()
        if not known_zone:
            raise problem(422, "invalid_timezone", f"Unknown time zone {timezone!r}.")
        details["timezone"] = timezone
    status_changed = status is not None and status != league.status
    if not details and not status_changed:
        return
    lg = t.leagues
    connection.execute(
        update(lg)
        .where(lg.c.id == league_id, lg.c.version == league.version)
        .values(**details, **({"status": status} if status_changed else {}), updated_at=func.now(), version=lg.c.version + 1)
    )
    if details:
        _admin_record(
            account,
            league_id,
            action="league.updated",
            entity_type="league",
            entity_id=league_id,
            before={key: getattr(league, key) for key in details},
            after=details,
        )
    if status_changed:
        restored = status == "active"
        _admin_record(
            account,
            league_id,
            action="league.restored" if restored else "league.archived",
            entity_type="league",
            entity_id=league_id,
            before={"status": league.status},
            after={"status": status},
            feed=FeedEntry(kind="league_restored", title=f"{details.get('name', league.name)} is open again.") if restored else None,
        )


def appoint_captain(account: Account, league_id: UUID, membership_id: UUID) -> None:
    """Makes an active, claimed membership the league's captain. The admin appoints directly;
    the plan's accept-a-transfer flow is not built."""
    connection = account.connection
    league = _admin_target(account, league_id, for_update=True)
    m = t.league_memberships
    row = connection.execute(select(m).where(m.c.id == membership_id, m.c.league_id == league_id)).first()
    if row is None or row.status != "active":
        raise problem(404, "unknown_member", "Unknown member.")
    if membership_id == league.captain_membership_id:
        raise problem(409, "already_captain", f"{row.display_name} is already the captain.")
    if row.user_id is None:
        raise problem(409, "not_claimed", "Only a member who has claimed their name can be captain.")
    lg = t.leagues
    connection.execute(
        update(lg)
        .where(lg.c.id == league_id, lg.c.version == league.version)
        .values(captain_membership_id=membership_id, updated_at=func.now(), version=lg.c.version + 1)
    )
    _admin_record(
        account,
        league_id,
        action="league.captain_appointed",
        entity_type="league",
        entity_id=league_id,
        before={"captainMembershipId": str(league.captain_membership_id)},
        after={"captainMembershipId": str(membership_id)},
        feed=FeedEntry(kind="captain_appointed", title=f"{row.display_name} is captain.", subject_membership_id=membership_id),
    )


def add_admin_membership(
    account: Account, league_id: UUID, *, display_name: str | None, full_name: str | None
) -> tuple[UUID, bool]:
    """Adds the admin to the league as a member outside the season, so their writes there
    are attributed to them. Returns the membership id and whether it is new. Idempotent: an
    active membership is returned as it is, and a withdrawn one is reinstated (still out of
    season). The name defaults to the admin's name in another league, else "Admin"."""
    connection = account.connection
    _admin_target(account, league_id)
    m = t.league_memberships
    existing = connection.execute(
        select(m).where(m.c.league_id == league_id, m.c.user_id == account.user_id).with_for_update()
    ).first()
    if existing is not None and existing.status == "active":
        return existing.id, False
    if existing is not None:
        connection.execute(
            update(m)
            .where(m.c.id == existing.id, m.c.version == existing.version)
            .values(status="active", left_at=None, withdrawal_reason=None, updated_at=func.now(), version=m.c.version + 1)
        )
        _admin_record(
            account,
            league_id,
            action="membership.admin_added",
            entity_type="league_membership",
            entity_id=existing.id,
            before={"status": "withdrawn"},
            after={"status": "active", "displayName": existing.display_name, "inSeason": False},
            feed=FeedEntry(kind="member_returned", title=f"{existing.display_name} is back as admin.", subject_membership_id=existing.id),
        )
        return existing.id, False

    name = display_name or _admin_display_name(account, league_id)
    taken = connection.execute(
        select(m.c.id).where(m.c.league_id == league_id, m.c.status == "active", func.lower(m.c.display_name) == name.lower())
    ).first()
    if taken is not None:
        raise problem(409, "duplicate_member", f"Another member of this league is called {name}. Choose another name.")
    membership_id = connection.execute(
        insert(m)
        .values(league_id=league_id, user_id=account.user_id, display_name=name, full_name=full_name or name)
        .returning(m.c.id)
    ).scalar_one()
    _admin_record(
        account,
        league_id,
        action="membership.admin_added",
        entity_type="league_membership",
        entity_id=membership_id,
        after={"status": "active", "displayName": name, "inSeason": False},
        feed=FeedEntry(kind="member_joined", title=f"{name} joined the clubhouse as admin.", subject_membership_id=membership_id),
    )
    return membership_id, True


def _admin_display_name(account: Account, league_id: UUID) -> str:
    """The admin's display name in their most recently updated other membership, else
    "Admin". The account's own memberships are readable in any league context."""
    m = t.league_memberships
    name = account.connection.execute(
        select(m.c.display_name)
        .where(m.c.user_id == account.user_id, m.c.league_id != league_id, m.c.status == "active")
        .order_by(m.c.updated_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    return name or ADMIN_DISPLAY_NAME


# Own profile --------------------------------------------------------------------------

PHOTO_TYPE = "image/jpeg"


@dataclass(frozen=True)
class Profile:
    favourite_team_id: str | None
    photo_url: str | None


# Notifications read state ------------------------------------------------------------

# The web app keeps one key per item it has shown; the whole round fits well inside this.
MAX_READ_KEYS = 200
MAX_READ_KEY_LENGTH = 120


@dataclass(frozen=True)
class NotificationsRead:
    """A high-water mark plus the keys of items read individually above it."""

    read_at: datetime | None
    read_keys: list[str]


def notifications_read(actor: Actor) -> NotificationsRead:
    """The membership's read state; nothing is read in the admin's view of another league."""
    if actor.membership_id is None:
        return NotificationsRead(None, [])
    m = t.league_memberships
    row = actor.connection.execute(
        select(m.c.notifications_read_at, m.c.notifications_read_keys).where(m.c.id == actor.membership_id)
    ).one()
    return NotificationsRead(row.notifications_read_at, _read_keys(row.notifications_read_keys))


def update_notifications_read(actor: Actor, *, read_at: datetime | None, read_keys: Sequence[str]) -> NotificationsRead:
    """Merges the caller's read state in this league. The mark never moves back and never runs ahead of the
    server clock, so a stale device cannot undo what another device has read, and keys from
    both are kept, newest first, within the bound."""
    membership_id = require_membership(actor)
    incoming = list(dict.fromkeys(key.strip() for key in read_keys if key.strip()))
    if len(incoming) > MAX_READ_KEYS or any(len(key) > MAX_READ_KEY_LENGTH for key in incoming):
        raise problem(422, "invalid_read_keys", "Too many or too long notification keys.")
    m = t.league_memberships
    current = actor.connection.execute(
        select(m.c.notifications_read_at, m.c.notifications_read_keys).where(m.c.id == membership_id).with_for_update()
    ).one()
    now = now_utc()
    if read_at is not None and read_at.tzinfo is None:
        read_at = read_at.replace(tzinfo=timezone.utc)
    marks = [mark for mark in (current.notifications_read_at, read_at) if mark is not None]
    merged_at = min(max(marks), now) if marks else None
    merged_keys = list(dict.fromkeys([*incoming, *_read_keys(current.notifications_read_keys)]))[:MAX_READ_KEYS]
    actor.connection.execute(
        update(m)
        .where(m.c.id == membership_id)
        .values(notifications_read_at=merged_at, notifications_read_keys=merged_keys, updated_at=func.now())
    )
    return NotificationsRead(merged_at, merged_keys)


def _read_keys(value: Any) -> list[str]:
    return [key for key in value if isinstance(key, str)] if isinstance(value, list) else []


def _photo_prefix(user_id: UUID) -> str:
    return f"avatars/{user_id}/"


def photo_url(connection: Connection, user_id: UUID, storage: Storage, url_ttl_seconds: int) -> str | None:
    """A short-lived URL for the account's photo, or None."""
    path = connection.execute(select(t.users.c.photo_path).where(t.users.c.id == user_id)).scalar_one()
    if not path:
        return None
    try:
        return storage.signed_url(path, url_ttl_seconds)
    except StorageError:
        # The team still loads; the member sees their initials until Storage recovers.
        return None


def profile(actor: Actor, storage: Storage, url_ttl_seconds: int) -> Profile:
    """The caller's favourite team in this league and a short-lived URL for their photo."""
    return Profile(actor.favourite_team_id, photo_url(actor.connection, actor.user_id, storage, url_ttl_seconds))


def reserve_photo_upload(actor: Actor, storage: Storage, *, content_type: str, size_bytes: int, max_bytes: int) -> dict[str, Any]:
    """A signed upload for a new photo at a fresh path the caller owns."""
    if content_type != PHOTO_TYPE:
        raise problem(422, "not_a_jpeg", "Profile photos are uploaded as JPEG.")
    if size_bytes <= 0 or size_bytes > max_bytes:
        raise problem(422, "too_large", f"Choose a photo smaller than {max_bytes // 1024} KB.")
    path = f"{_photo_prefix(actor.user_id)}{uuid4()}-{secrets.token_urlsafe(8)}.jpg"
    try:
        grant = storage.create_signed_upload(path)
    except StorageError as exc:
        raise problem(503, "storage_unavailable", "Photo storage is unavailable. Try again later.") from exc
    return {"bucket": storage.bucket, "path": path, "token": grant.token}


def update_profile(
    actor: Actor,
    storage: Storage,
    *,
    favourite_team_id: str,
    photo_path: str | None,
    remove_photo: bool,
    max_bytes: int,
) -> None:
    """Changes only the caller's own profile: the team on their membership in this league
    (one of the league's competition's clubs) and the account-wide photo. A new photo must be
    an upload the caller made."""
    membership_id = require_membership(actor)
    if actor.competition.club(favourite_team_id) is None:
        raise problem(422, "unknown_team", "Choose a team from this competition.")
    u, m = t.users, t.league_memberships
    user = actor.connection.execute(select(u.c.photo_path).where(u.c.id == actor.user_id).with_for_update()).one()
    previous_team = actor.connection.execute(
        select(m.c.favourite_team_id).where(m.c.id == membership_id).with_for_update()
    ).scalar_one()
    new_path = user.photo_path
    if photo_path is not None:
        pattern = rf"{re.escape(_photo_prefix(actor.user_id))}[0-9a-f-]{{36}}-[A-Za-z0-9_-]+\.jpg"
        if not re.fullmatch(pattern, photo_path):
            raise problem(404, "unknown_photo", "Unknown photo upload.")
        try:
            stored = storage.stored_object(photo_path)
        except StorageError as exc:
            raise problem(503, "storage_unavailable", "Photo storage is unavailable. Try again later.") from exc
        if stored is None:
            raise problem(409, "photo_missing", "The photo upload did not finish. Try again.")
        try:
            # The browser's type claim is not trusted: a JPEG starts with FF D8 FF.
            is_jpeg = storage.read_prefix(photo_path, 3) == b"\xff\xd8\xff"
        except StorageError as exc:
            raise problem(503, "storage_unavailable", "Photo storage is unavailable. Try again later.") from exc
        if not is_jpeg or stored.size_bytes is None or stored.size_bytes > max_bytes:
            _discard(storage, photo_path)
            raise problem(422, "invalid_photo", "That photo could not be used. Choose a different image.")
        new_path = photo_path
    elif remove_photo:
        new_path = None

    if new_path != user.photo_path:
        actor.connection.execute(
            update(u)
            .where(u.c.id == actor.user_id)
            .values(photo_path=new_path, photo_updated_at=func.now(), updated_at=func.now())
        )
    if favourite_team_id != previous_team:
        actor.connection.execute(
            update(m)
            .where(m.c.id == membership_id)
            .values(favourite_team_id=favourite_team_id, updated_at=func.now(), version=m.c.version + 1)
        )
        actor.favourite_team_id = favourite_team_id
    record(
        actor,
        action="profile.updated",
        entity_type="user",
        entity_id=actor.user_id,
        before={"favouriteTeamId": previous_team, "photo": user.photo_path is not None},
        after={"favouriteTeamId": favourite_team_id, "photo": new_path is not None},
    )
    if user.photo_path and user.photo_path != new_path:
        _discard(storage, user.photo_path)


def _discard(storage: Storage, path: str) -> None:
    """Best-effort removal of a replaced or rejected photo. A leftover private object is harmless."""
    try:
        storage.delete_object(path)
    except StorageError:
        pass


# Duties -------------------------------------------------------------------------------


@dataclass(frozen=True)
class DutyView:
    row: Any
    member_id: UUID
    member_name: str
    marks: MarkCalculation
    display: str
    links: list[Any]
    # The fixtures whose picks this duty covers, in schedule order.
    pick_fixture_ids: list[str]


def _duty_query(actor: Actor):
    d, sm, m = t.duties, t.season_memberships, t.league_memberships
    return (
        select(d, m.c.id.label("member_id"), m.c.display_name.label("member_name"))
        .select_from(d.join(sm, sm.c.id == d.c.season_membership_id).join(m, m.c.id == sm.c.membership_id))
        .where(d.c.season_id == actor.season_id)
    )


def duties(actor: Actor, round_number: int | None = None, duty_id: UUID | None = None) -> list[DutyView]:
    """The duty register (and so the marks table) lists active members only; a withdrawn
    member's duties and marks stay in the database and come back on reinstatement. One duty
    asked for by id is returned whoever it belongs to."""
    query = _duty_query(actor)
    if duty_id is None:
        query = query.where(t.league_memberships.c.status == "active")
    if round_number is not None:
        query = query.where(t.duties.c.round_number == round_number)
    if duty_id is not None:
        query = query.where(t.duties.c.id == duty_id)
    rows = actor.connection.execute(query.order_by(t.duties.c.deadline_at.nulls_last(), t.duties.c.created_at)).all()
    if not rows:
        return []
    l, s, m = t.duty_evidence_links, t.evidence_submissions, t.league_memberships
    links = actor.connection.execute(
        select(
            l.c.id,
            l.c.duty_id,
            l.c.submission_id,
            l.c.decision,
            l.c.decided_at,
            l.c.reason,
            l.c.effective_completed_at,
            s.c.submitted_at,
            s.c.claimed_completed_at,
            s.c.note,
            s.c.asset_id,
            s.c.submitter_membership_id,
            m.c.display_name.label("submitter_name"),
        )
        .select_from(l.join(s, s.c.id == l.c.submission_id).join(m, m.c.id == s.c.submitter_membership_id))
        .where(l.c.duty_id.in_([r.id for r in rows]))
        .order_by(s.c.submitted_at.desc())
    ).all()
    by_duty: dict[UUID, list[Any]] = {}
    for link in links:
        by_duty.setdefault(link.duty_id, []).append(link)
    p = t.picks
    covered: dict[UUID, list[str]] = {}
    for pick in actor.connection.execute(
        select(p.c.duty_id, p.c.fixture_id).where(p.c.league_id == actor.league_id, p.c.duty_id.in_([r.id for r in rows]))
    ).all():
        covered.setdefault(pick.duty_id, []).append(pick.fixture_id)
    order = _schedule_order(actor.competition)
    now = now_utc()
    views = []
    for row in rows:
        duty_links = by_duty.get(row.id, [])
        fixture_ids = sorted(covered.get(row.id, []), key=lambda fixture_id: (order.get(fixture_id, len(order)), fixture_id))
        views.append(
            DutyView(
                row,
                row.member_id,
                row.member_name,
                duty_marks(actor, row, now),
                _display(row, duty_links, now),
                duty_links,
                fixture_ids,
            )
        )
    return views


def duty_marks(actor: Actor, row: Any, now: datetime) -> MarkCalculation:
    """The duty's marks. A duty voided because its member was withdrawn is not voided for
    the calculation: it stopped accruing at the withdrawal and keeps what it had, so removing
    and reinstating a member does not wipe their marks. It still displays as voided."""
    withdrawn = row.status == "voided" and row.void_reason == WITHDRAWN_DUTY_REASON and row.voided_at is not None
    return calculate(
        deadline_at=row.deadline_at,
        completed_at=row.completed_at,
        voided=row.status == "voided" and not withdrawn,
        now=now,
        closure_at=actor.season_closed_at,
        clock_reset_at=row.clock_reset_at,
        withdrawn_at=row.voided_at if withdrawn else None,
    )


def _display(row: Any, links: list[Any], now: datetime) -> str:
    if row.status != "open":
        return row.status
    if any(link.decision == "pending" for link in links):
        return "under_review"
    return "overdue" if row.deadline_at is not None and now > row.deadline_at else "open"


def duty_title(competition: Competition, duty_type: str, round_number: int | None) -> str:
    label = "Spoon duty" if duty_type == "spoon" else "Pick confirmation"
    if round_number is None:
        return label
    return f"{competition.round_label(round_number)} {label}"


def create_duty(
    actor: Actor,
    *,
    member_id: UUID,
    duty_type: str,
    round_number: int | None,
    deadline_at: datetime | None,
    reason: str,
    pick_fixture_ids: Sequence[str] | None = None,
) -> UUID:
    """Opens a duty. A pick confirmation duty may cover picks (`pick_fixture_ids`): the
    member's picks of those fixtures are linked to it, and a `missed` pick is recorded where
    the member has none."""
    created_by = require_membership(actor)
    if duty_type not in DUTY_TYPES:
        raise problem(422, "unknown_duty_type", "Unknown duty type.")
    fixture_ids = list(dict.fromkeys(pick_fixture_ids or []))
    if fixture_ids and duty_type != "pick_confirmation":
        raise problem(422, "invalid_pick_links", "Only a pick confirmation duty covers picks.")
    for fixture_id in fixture_ids:
        _fixture(actor, fixture_id)
    sm = t.season_memberships
    # A shared lock, so a concurrent withdrawal (which updates this row) waits for the duty
    # and then voids it, or this waits for the withdrawal and finds no active enrolment.
    season_membership_id = actor.connection.execute(
        select(sm.c.id)
        .where(
            sm.c.league_id == actor.league_id,
            sm.c.season_id == actor.season_id,
            sm.c.membership_id == member_id,
            sm.c.status == "active",
        )
        .with_for_update(read=True)
    ).scalar_one_or_none()
    if season_membership_id is None:
        raise problem(404, "unknown_member", "That member is not enrolled in this season.")
    if deadline_at is None:
        deadline_at = default_deadline(actor.competition, duty_type, round_number)
    status = "open" if deadline_at is not None else "pending_deadline"
    try:
        with actor.connection.begin_nested():
            duty_id = actor.connection.execute(
                insert(t.duties)
                .values(
                    league_id=actor.league_id,
                    season_id=actor.season_id,
                    season_membership_id=season_membership_id,
                    round_number=round_number,
                    type=duty_type,
                    reason=reason,
                    deadline_at=deadline_at,
                    status=status,
                    created_by_membership_id=created_by,
                )
                .returning(t.duties.c.id)
            ).scalar_one()
    except IntegrityError as exc:
        raise problem(409, "duplicate_duty", "That member already has a live duty of this type in this round.") from exc
    for fixture_id in fixture_ids:
        _link_pick(actor, member_id, season_membership_id, fixture_id, duty_id, created_by)
    member_name = actor.connection.execute(
        select(t.league_memberships.c.display_name).where(
            t.league_memberships.c.id == member_id, t.league_memberships.c.league_id == actor.league_id
        )
    ).scalar_one()
    title = duty_title(actor.competition, duty_type, round_number)
    record(
        actor,
        action="duty.created",
        entity_type="duty",
        entity_id=duty_id,
        reason=reason,
        after={
            "type": duty_type,
            "roundNumber": round_number,
            "deadlineAt": _iso(deadline_at),
            "status": status,
            **({"pickFixtureIds": fixture_ids} if fixture_ids else {}),
        },
        feed=FeedEntry(
            kind="duty_created",
            title=f"{member_name}: {title}.",
            detail=reason or ("Deadline to be confirmed." if deadline_at is None else ""),
            round_number=round_number,
            subject_membership_id=member_id,
            duty_id=duty_id,
        ),
    )
    return duty_id


def void_duty(actor: Actor, duty_id: UUID, *, reason: str) -> None:
    d = t.duties
    row = actor.connection.execute(select(d).where(d.c.id == duty_id).with_for_update()).first()
    if row is None:
        raise problem(404, "unknown_duty", "Unknown duty.")
    if row.status in ("voided", "completed"):
        raise problem(409, "duty_closed", "A completed or voided duty cannot be voided.")
    if reason.strip().lower() == WITHDRAWN_DUTY_REASON.lower():
        # That reason marks duties voided by a withdrawal, whose marks keep counting.
        raise problem(422, "reserved_reason", "Give a different reason; that one is reserved for withdrawals.")
    actor.connection.execute(
        update(d)
        .where(d.c.id == duty_id, d.c.version == row.version)
        .values(status="voided", voided_at=func.now(), void_reason=reason, updated_at=func.now(), version=d.c.version + 1)
    )
    actor.connection.execute(
        update(t.duty_evidence_links)
        .where(t.duty_evidence_links.c.duty_id == duty_id, t.duty_evidence_links.c.decision == "pending")
        .values(decision="superseded", updated_at=func.now(), version=t.duty_evidence_links.c.version + 1)
    )
    view = duties(actor, duty_id=duty_id)[0]
    record(
        actor,
        action="duty.voided",
        entity_type="duty",
        entity_id=duty_id,
        reason=reason,
        before={"status": row.status},
        after={"status": "voided"},
        feed=FeedEntry(
            kind="duty_voided",
            title=f"{view.member_name}: {duty_title(actor.competition, row.type, row.round_number)} voided.",
            detail=reason,
            round_number=row.round_number,
            subject_membership_id=view.member_id,
            duty_id=duty_id,
        ),
    )


def reset_clock(actor: Actor, duty_id: UUID, *, reason: str) -> None:
    """A challenge resolved in the member's favour restarts the overdue clock from now.

    League decision: challenges never pause accrual. Resolved against the member, the marks
    stand and nothing is recorded here; resolved in their favour, elapsed time resets.
    """
    d = t.duties
    row = actor.connection.execute(select(d).where(d.c.id == duty_id).with_for_update()).first()
    if row is None:
        raise problem(404, "unknown_duty", "Unknown duty.")
    if row.status != "open":
        raise problem(409, "duty_closed", "Only an open duty's clock can be reset.")
    view = duties(actor, duty_id=duty_id)[0]
    if view.member_id == actor.membership_id:
        raise problem(403, "self_review", "A challenge about your own duty needs an uninvolved decision.")
    now = now_utc()
    actor.connection.execute(
        update(d)
        .where(d.c.id == duty_id, d.c.version == row.version)
        .values(clock_reset_at=now, updated_at=func.now(), version=d.c.version + 1)
    )
    record(
        actor,
        action="duty.clock_reset",
        entity_type="duty",
        entity_id=duty_id,
        reason=reason,
        before={"clockResetAt": _iso(row.clock_reset_at), "marks": view.marks.marks},
        after={"clockResetAt": _iso(now), "marks": 0},
        feed=FeedEntry(
            kind="duty_clock_reset",
            title=f"{view.member_name}: {duty_title(actor.competition, row.type, row.round_number)} clock reset.",
            detail=reason,
            round_number=row.round_number,
            subject_membership_id=view.member_id,
            duty_id=duty_id,
        ),
    )


def marks_totals(actor: Actor) -> list[dict[str, Any]]:
    totals: dict[UUID, dict[str, Any]] = {}
    for view in duties(actor):
        entry = totals.setdefault(
            view.member_id, {"memberId": view.member_id, "memberName": view.member_name, "marks": 0, "openDuties": 0}
        )
        entry["marks"] += view.marks.marks
        if view.row.status in ("open", "pending_deadline"):
            entry["openDuties"] += 1
    return sorted(totals.values(), key=lambda e: (-e["marks"], e["memberName"]))


# Superbru standings -------------------------------------------------------------------


def standings(actor: Actor, round_number: int | None = None) -> list[dict[str, Any]]:
    """Round points per active member in the active season. Ranks are derived here: tied
    points share a rank and the next rank skips (1, 2, 2, 4). Ties list alphabetically. A
    withdrawn member's rows stay stored but are left out, and return on reinstatement."""
    rs = t.round_standings
    sm = t.season_memberships
    m = t.league_memberships
    query = (
        select(rs.c.round_number, rs.c.points, m.c.id.label("member_id"), m.c.display_name)
        .select_from(rs.join(sm, sm.c.id == rs.c.season_membership_id).join(m, m.c.id == sm.c.membership_id))
        .where(rs.c.league_id == actor.league_id, rs.c.season_id == actor.season_id, m.c.status == "active")
    )
    if round_number is not None:
        query = query.where(rs.c.round_number == round_number)
    rows = sorted(
        actor.connection.execute(query).all(),
        key=lambda r: (r.round_number, -r.points, r.display_name.lower()),
    )
    result: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        previous = rows[index - 1] if index else None
        if previous is None or previous.round_number != row.round_number:
            rank, position = 1, 1
        else:
            position += 1
            if row.points != previous.points:
                rank = position
        result.append(
            {
                "roundNumber": row.round_number,
                "memberId": row.member_id,
                "memberName": row.display_name,
                "rank": rank,
                "points": float(row.points),
            }
        )
    return result


def record_standings(actor: Actor, round_number: int, entries: Sequence[tuple[UUID, Decimal]]) -> None:
    """Replaces a round's Superbru table with the captain's copy of the pool results. Active
    members left out lose their row for the round; a withdrawn member's rows are kept.
    Unchanged rows are left alone. Rows are matched by member, because a reinstated member's
    earlier rows point at the season membership that ended with the withdrawal."""
    recorded_by = require_membership(actor)
    member_ids = [member_id for member_id, _ in entries]
    if len(set(member_ids)) != len(member_ids):
        raise problem(422, "duplicate_member", "Each member can appear once in a round's standings.")
    sm = t.season_memberships
    m = t.league_memberships
    enrolled = _enrolled(actor)
    unknown = [member_id for member_id in member_ids if member_id not in enrolled]
    if unknown:
        raise problem(404, "unknown_member", "Every member in the standings must be enrolled in this season.")
    rs = t.round_standings
    existing = {
        row.membership_id: row
        for row in actor.connection.execute(
            select(rs.c.id, rs.c.points, sm.c.membership_id, m.c.display_name)
            .select_from(rs.join(sm, sm.c.id == rs.c.season_membership_id).join(m, m.c.id == sm.c.membership_id))
            .where(rs.c.season_id == actor.season_id, rs.c.round_number == round_number, m.c.status == "active")
            .with_for_update(of=rs)
        ).all()
    }
    wanted = dict(entries)
    before = {row.display_name: float(row.points) for row in existing.values()}
    after = {enrolled[member_id].display_name: float(points) for member_id, points in wanted.items()}
    if before == after:
        return
    removed = [row.id for member_id, row in existing.items() if member_id not in wanted]
    if removed:
        actor.connection.execute(rs.delete().where(rs.c.id.in_(removed)))
    for member_id, points in wanted.items():
        current = existing.get(member_id)
        if current is None:
            actor.connection.execute(
                insert(rs).values(
                    league_id=actor.league_id,
                    season_id=actor.season_id,
                    season_membership_id=enrolled[member_id].id,
                    round_number=round_number,
                    points=points,
                    recorded_by_membership_id=recorded_by,
                )
            )
        elif current.points != points:
            actor.connection.execute(
                update(rs)
                .where(rs.c.id == current.id)
                .values(
                    points=points,
                    recorded_by_membership_id=recorded_by,
                    updated_at=func.now(),
                    version=rs.c.version + 1,
                )
            )
    table = standings(actor, round_number)
    leaders = [row["memberName"] for row in table if row["rank"] == 1]
    detail = ""
    if leaders:
        detail = f"{' and '.join(leaders)} {'leads' if len(leaders) == 1 else 'lead'} on {table[0]['points']:g} points."
    record(
        actor,
        action="standings.recorded",
        entity_type="round_standings",
        entity_id=None,
        before={"roundNumber": round_number, "points": before},
        after={"roundNumber": round_number, "points": after},
        feed=FeedEntry(
            kind="standings_recorded",
            title=f"{actor.competition.round_label(round_number)} Superbru standings updated.",
            detail=detail,
            round_number=round_number,
        ),
    )


def _enrolled(actor: Actor) -> dict[UUID, Any]:
    """Active members enrolled in the active season, by league membership id: each row has
    the season membership `id`, `membership_id` and `display_name`."""
    sm, m = t.season_memberships, t.league_memberships
    return {
        row.membership_id: row
        for row in actor.connection.execute(
            select(sm.c.id, sm.c.membership_id, m.c.display_name)
            .select_from(sm.join(m, m.c.id == sm.c.membership_id))
            .where(
                sm.c.league_id == actor.league_id,
                m.c.league_id == actor.league_id,
                sm.c.season_id == actor.season_id,
                sm.c.status == "active",
                m.c.status == "active",
            )
        ).all()
    }


def _member_rows(actor: Actor, table: Any, member_id: UUID) -> Any:
    """A condition on `table` (picks or round_standings) for the member's rows in the active
    season, on any of their season memberships (a reinstated member has several)."""
    sm = t.season_memberships
    return table.c.season_membership_id.in_(
        select(sm.c.id).where(sm.c.membership_id == member_id, sm.c.season_id == actor.season_id, sm.c.league_id == actor.league_id)
    )


def clear_standing(actor: Actor, round_number: int, member_id: UUID) -> None:
    """Clears one member's stored round total, so the derived total shows again. Nothing to
    clear is not an error."""
    member = _league_membership(actor, member_id)
    rs = t.round_standings
    removed = actor.connection.execute(
        rs.delete()
        .where(
            rs.c.league_id == actor.league_id,
            rs.c.season_id == actor.season_id,
            rs.c.round_number == round_number,
            _member_rows(actor, rs, member_id),
        )
        .returning(rs.c.points)
    ).first()
    if removed is None:
        return
    record(
        actor,
        action="standings.cleared",
        entity_type="round_standings",
        entity_id=None,
        before={"roundNumber": round_number, "points": {member.display_name: float(removed.points)}},
        after={"roundNumber": round_number, "points": {}},
    )


# Superbru rules -----------------------------------------------------------------------
#
# Rules belong to the season. `seasons.rules` stores only the keys that differ from
# DEFAULT_RULES (Piele's rules) and reads merge them; the previous champion is the column
# `previous_champion_membership_id`. The web's scoring module reads the merged rules.

PREVIOUS_CHAMPION = "previousChampionMemberId"
WIN_POINT_KEYS = ("regular", "quarterFinal", "semiFinal", "final")
RULE_FLAGS = ("defaultPicks", "picksHiddenBeforeKickoff", "bonusPoint", "bonusPointSplit", "bonusPointRangeCapped")
RULE_NUMBERS = ("marginPoint", "marginWindow", "bonusPointValue", "bonusPointMinimumShare", "bonusRange", "grandSlamPoints")
# Generous: enough for any scoring scheme, small enough to catch a typo.
MAX_RULE_NUMBER = 1000

DEFAULT_RULES: dict[str, Any] = {
    "defaultPicks": True,
    "picksHiddenBeforeKickoff": False,
    "bonusPoint": True,
    "bonusPointSplit": True,
    "bonusPointRangeCapped": True,
    "startingRound": 1,
    "winPoints": {"regular": 1, "quarterFinal": 1.5, "semiFinal": 2, "final": 3},
    "marginPoint": 0.5,
    "marginWindow": 5,
    "bonusPointValue": 1,
    "bonusPointMinimumShare": 0.25,
    "bonusRange": 15,
    "grandSlamPoints": 2,
    PREVIOUS_CHAMPION: None,
}


def merge_rules(stored: Any, previous_champion_id: UUID | None) -> dict[str, Any]:
    """The season's full rules: DEFAULT_RULES with the stored differences over them. Unknown
    stored keys are ignored."""
    rules = copy.deepcopy(DEFAULT_RULES)
    for key, value in (stored if isinstance(stored, dict) else {}).items():
        if key == "winPoints" and isinstance(value, dict):
            rules["winPoints"].update({name: points for name, points in value.items() if name in WIN_POINT_KEYS})
        elif key in DEFAULT_RULES and key not in ("winPoints", PREVIOUS_CHAMPION):
            rules[key] = value
    rules[PREVIOUS_CHAMPION] = str(previous_champion_id) if previous_champion_id is not None else None
    return rules


def season_rules(season: Any) -> dict[str, Any]:
    """The merged rules of a `seasons` row."""
    return merge_rules(season.rules, season.previous_champion_membership_id)


def stored_rules(rules: Mapping[str, Any]) -> dict[str, Any]:
    """What `seasons.rules` keeps of full rules: the keys that differ from DEFAULT_RULES
    (within winPoints, the round types that differ), the champion left to its column."""
    stored: dict[str, Any] = {}
    for key, default in DEFAULT_RULES.items():
        if key == PREVIOUS_CHAMPION:
            continue
        if key == "winPoints":
            changed = {name: points for name, points in rules[key].items() if points != default[name]}
            if changed:
                stored[key] = changed
        elif rules[key] != default:
            stored[key] = rules[key]
    return stored


def _invalid_rules(message: str) -> HTTPException:
    return problem(422, "invalid_rules", message)


def _rule_number(key: str, value: Any) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise _invalid_rules(f"{key} must be a number.")
    if not 0 <= value <= MAX_RULE_NUMBER:
        raise _invalid_rules(f"{key} must be from 0 to {MAX_RULE_NUMBER}.")
    return value


def check_rules_change(change: Mapping[str, Any], competition: Competition) -> dict[str, Any]:
    """A validated copy of a change to the rules (any subset of the keys; winPoints may be
    partial), or 422 `invalid_rules`: flags are booleans, numbers are from 0 to
    MAX_RULE_NUMBER, startingRound is one of the competition's rounds and the champion is a
    member id or null. Whether the champion belongs to the league is checked on save."""
    if not isinstance(change, Mapping):
        raise _invalid_rules("Send the rules as an object.")
    checked: dict[str, Any] = {}
    for key, value in change.items():
        if key in RULE_FLAGS:
            if not isinstance(value, bool):
                raise _invalid_rules(f"{key} must be true or false.")
            checked[key] = value
        elif key in RULE_NUMBERS:
            checked[key] = _rule_number(key, value)
        elif key == "winPoints":
            if not isinstance(value, Mapping):
                raise _invalid_rules("winPoints must be an object.")
            unknown = [name for name in value if name not in WIN_POINT_KEYS]
            if unknown:
                raise _invalid_rules(f"Unknown round type {unknown[0]!r} in winPoints.")
            checked[key] = {name: _rule_number(f"winPoints.{name}", points) for name, points in value.items()}
        elif key == "startingRound":
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= competition.last_round:
                raise _invalid_rules(f"startingRound must be a round from 1 to {competition.last_round}.")
            checked[key] = value
        elif key == PREVIOUS_CHAMPION:
            if value is None:
                checked[key] = None
            else:
                try:
                    checked[key] = str(UUID(str(value)))
                except ValueError:
                    raise _invalid_rules("previousChampionMemberId must be a member id or null.") from None
        else:
            raise _invalid_rules(f"Unknown rule {key!r}.")
    return checked


def apply_rules_change(rules: Mapping[str, Any], change: Mapping[str, Any]) -> dict[str, Any]:
    """Full rules with a checked change applied."""
    updated = copy.deepcopy(dict(rules))
    for key, value in change.items():
        if key == "winPoints":
            updated["winPoints"] = {**updated["winPoints"], **value}
        else:
            updated[key] = value
    return updated


def _season_for_update(connection: Connection, league_id: UUID) -> Any:
    """The league's active season, locked, or None. Needs the league context."""
    s = t.seasons
    return connection.execute(
        select(s).where(s.c.league_id == league_id, s.c.status == "active").with_for_update()
    ).first()


def _save_rules(
    connection: Connection, league_id: UUID, season: Any, change: Mapping[str, Any], competition: Competition
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Applies a change to a locked season's rules. Returns the changed keys' values before
    and after, or None when nothing changed. 404 `unknown_member` for a champion who is not a
    member of the league."""
    checked = check_rules_change(change, competition)
    current = season_rules(season)
    updated = apply_rules_change(current, checked)
    champion = updated[PREVIOUS_CHAMPION]
    if champion is not None and champion != current[PREVIOUS_CHAMPION]:
        m = t.league_memberships
        found = connection.execute(select(m.c.id).where(m.c.id == UUID(champion), m.c.league_id == league_id)).first()
        if found is None:
            raise problem(404, "unknown_member", "The previous champion must be a member of this league.")
    if updated == current:
        return None
    s = t.seasons
    connection.execute(
        update(s)
        .where(s.c.id == season.id, s.c.league_id == league_id, s.c.version == season.version)
        .values(
            rules=stored_rules(updated),
            previous_champion_membership_id=UUID(champion) if champion is not None else None,
            updated_at=func.now(),
            version=s.c.version + 1,
        )
    )
    keys = [key for key in DEFAULT_RULES if updated[key] != current[key]]
    return {key: current[key] for key in keys}, {key: updated[key] for key in keys}


def _rules_record(season_id: UUID, before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """The audit event and feed entry of a rules change, as `record` keyword arguments."""
    return {
        "action": "rules.updated",
        "entity_type": "season",
        "entity_id": season_id,
        "before": before,
        "after": after,
        "feed": FeedEntry(kind="rules_updated", title="Superbru rules updated."),
    }


def rules(actor: Actor) -> dict[str, Any]:
    """The active season's Superbru rules, merged over DEFAULT_RULES."""
    season = actor.connection.execute(select(t.seasons).where(t.seasons.c.id == actor.season_id)).one()
    return season_rules(season)


def update_rules(actor: Actor, change: Mapping[str, Any]) -> dict[str, Any]:
    """Captain or admin changes any subset of the active season's rules. Returns the merged
    rules. An unchanged save records nothing."""
    season = _season_for_update(actor.connection, actor.league_id)
    if season is None or season.id != actor.season_id:
        raise problem(409, "no_active_season", "No active season.")
    changed = _save_rules(actor.connection, actor.league_id, season, change, actor.competition)
    if changed is not None:
        record(actor, **_rules_record(season.id, *changed))
    return rules(actor)


# Superbru picks -----------------------------------------------------------------------
#
# A pick is signed from the home side: 'home' or 'away' with a margin of 1 to 150, 'draw'
# (margin 0) or 'missed' (no margin). Members record their own pick until the fixture's
# kickoff in the competition schedule; the captain or admin records or corrects any pick at
# any time and marks Superbru default picks. A member sees the rest of the pool's picks for a
# fixture once their own pick is in or the fixture has kicked off; the admin without a
# membership always sees them.

PICK_SIDES = ("home", "away", "draw", "missed")
MAX_MARGIN = 150
RESULT_STATES = frozenset({"live", "half_time", "full_time", "postponed", "cancelled"})
NOT_PLAYED = frozenset({"postponed", "cancelled"})


def check_pick(
    side: str, margin: int | None, *, is_default: bool = False, own: bool = False, default_picks: bool = True
) -> tuple[str, int | None, bool]:
    """The pick as stored (a draw's margin is 0), or 422 `invalid_pick`. A member's own pick
    is home, away or a draw; `missed` and default picks are for the steward, and defaults
    only while the rules allow them."""
    if side not in PICK_SIDES or (own and side == "missed"):
        raise problem(422, "invalid_pick", "Pick the home side, the away side or a draw.")
    if side in ("home", "away"):
        if isinstance(margin, bool) or not isinstance(margin, int) or not 1 <= margin <= MAX_MARGIN:
            raise problem(422, "invalid_pick", f"Pick a winning margin from 1 to {MAX_MARGIN}.")
    elif side == "draw":
        if margin not in (None, 0):
            raise problem(422, "invalid_pick", "A draw has no margin.")
        margin = 0
    elif margin is not None:
        raise problem(422, "invalid_pick", "A missed pick has no margin.")
    if is_default:
        if side not in ("home", "away"):
            raise problem(422, "invalid_pick", "Only a home or away pick can be a Superbru default.")
        if not default_picks:
            raise problem(422, "invalid_pick", "Default picks are off in this season's rules.")
    return side, margin, is_default


def _fixture(actor: Actor, fixture_id: str) -> Fixture:
    fixture = actor.competition.schedule().fixture(fixture_id)
    if fixture is None:
        raise problem(404, "unknown_fixture", "Unknown match.")
    return fixture


def _schedule_order(competition: Competition) -> dict[str, int]:
    return {fixture.id: index for index, fixture in enumerate(competition.schedule().fixtures)}


def locked(fixture: Fixture, now: datetime) -> bool:
    """Picks lock at the scheduled kickoff. An unknown kickoff never locks."""
    return fixture.kickoff_utc is not None and fixture.kickoff_utc <= now


def _is_score(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def fixture_result(full_time: Mapping[str, Any] | None, match: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """A fixture's result: the stored full-time milestone's score (`{"home", "away"}`, see
    app/matchcentre/updates.py), else the round's cached score snapshot while the match is
    live, at half time, final, postponed or cancelled (postponed and cancelled carry 0-0 when
    the feed has no score; they are never scored). None when unknown."""
    if full_time is not None and _is_score(full_time.get("home")) and _is_score(full_time.get("away")):
        return {"homeScore": full_time["home"], "awayScore": full_time["away"], "state": "full_time"}
    if not isinstance(match, Mapping) or match.get("state") not in RESULT_STATES:
        return None
    home = (match.get("home") or {}).get("score")
    away = (match.get("away") or {}).get("score")
    if match["state"] in NOT_PLAYED:
        return {"homeScore": home if _is_score(home) else 0, "awayScore": away if _is_score(away) else 0, "state": match["state"]}
    if not (_is_score(home) and _is_score(away)):
        return None
    return {"homeScore": home, "awayScore": away, "state": match["state"]}


def stored_results(connection: Connection, competition: Competition, fixtures: Sequence[Fixture], now: datetime) -> dict[str, dict[str, Any]]:
    """Results by fixture id from `piele.fixture_milestones` (full time), falling back to the
    rounds' cached score snapshots in `piele.external_snapshots` for started fixtures without
    a stored full-time score. Reads only; the round updates route records the milestones."""
    known = milestones.by_fixture(connection, competition.id, [fixture.id for fixture in fixtures])
    full_time = {fixture_id: milestone.detail for (fixture_id, kind), milestone in known.items() if kind == milestones.FULL_TIME}
    pending = [
        fixture
        for fixture in fixtures
        if fixture_result(full_time.get(fixture.id), None) is None and score_feed.started(fixture, now)
    ]
    matches: dict[str, Any] = {}
    if pending:
        keys = sorted({round_scores_key(competition.id, fixture.round) for fixture in pending})
        rows = connection.execute(
            select(external_snapshots.c.status, external_snapshots.c.payload).where(external_snapshots.c.key.in_(keys))
        ).all()
        for row in rows:
            if row.status == "ok" and isinstance(row.payload, dict) and isinstance(row.payload.get("matches"), dict):
                matches.update(row.payload["matches"])
    results = {}
    for fixture in fixtures:
        result = fixture_result(full_time.get(fixture.id), matches.get(fixture.id))
        if result is not None:
            results[fixture.id] = result
    return results


def _pick_rows(actor: Actor, fixture_ids: Sequence[str]) -> list[Any]:
    """The active members' picks of these fixtures in the active season. Withdrawn members'
    picks stay stored and return on reinstatement."""
    p, sm, m = t.picks, t.season_memberships, t.league_memberships
    return actor.connection.execute(
        select(
            p.c.fixture_id,
            p.c.side,
            p.c.margin,
            p.c.is_default,
            p.c.duty_id,
            m.c.id.label("member_id"),
            m.c.display_name.label("member_name"),
        )
        .select_from(p.join(sm, sm.c.id == p.c.season_membership_id).join(m, m.c.id == sm.c.membership_id))
        .where(
            p.c.league_id == actor.league_id,
            p.c.season_id == actor.season_id,
            p.c.fixture_id.in_(list(fixture_ids)),
            m.c.status == "active",
        )
    ).all()


def _pick_view(row: Any) -> dict[str, Any]:
    return {
        "memberId": row.member_id,
        "memberName": row.member_name,
        "side": row.side,
        "margin": row.margin,
        "isDefault": row.is_default,
        "dutyId": row.duty_id,
    }


def _fixture_views(actor: Actor, fixtures: Sequence[Fixture], now: datetime) -> list[dict[str, Any]]:
    if not fixtures:
        return []
    by_fixture: dict[str, list[Any]] = {}
    for row in _pick_rows(actor, [fixture.id for fixture in fixtures]):
        by_fixture.setdefault(row.fixture_id, []).append(row)
    results = stored_results(actor.connection, actor.competition, fixtures, now)
    views = []
    for fixture in fixtures:
        rows = sorted(by_fixture.get(fixture.id, []), key=lambda row: (row.member_name.lower(), str(row.member_id)))
        mine = next((row for row in rows if row.member_id == actor.membership_id), None) if actor.membership_id else None
        is_locked = locked(fixture, now)
        visible = is_locked or mine is not None or actor.membership_id is None
        views.append(
            {
                "fixtureId": fixture.id,
                "roundNumber": fixture.round,
                "kickoffUtc": fixture.kickoff_utc,
                "locked": is_locked,
                "result": results.get(fixture.id),
                "myPick": _pick_view(mine) if mine is not None else None,
                "picks": [_pick_view(row) for row in rows] if visible else [],
            }
        )
    return views


def picks(actor: Actor, round_number: int | None = None) -> list[dict[str, Any]]:
    """Every fixture of the season's competition from the rules' starting round on whose
    kickoff is known (one round with `round_number`), in kickoff order, with its stored
    result and picks. The pool's picks are hidden (an empty list) from a member without a
    pick until kickoff."""
    starting_round = rules(actor)["startingRound"]
    fixtures = sorted(
        (
            fixture
            for fixture in actor.competition.schedule().fixtures
            if fixture.kickoff_utc is not None
            and fixture.round >= starting_round
            and (round_number is None or fixture.round == round_number)
        ),
        key=lambda fixture: (fixture.kickoff_utc, fixture.id),
    )
    return _fixture_views(actor, fixtures, now_utc())


def fixture_picks(actor: Actor, fixture_id: str) -> dict[str, Any]:
    """One fixture's picks as `picks` lists them, whatever its round or kickoff."""
    return _fixture_views(actor, [_fixture(actor, fixture_id)], now_utc())[0]


def _pick_label(side: str | None, margin: int | None, is_default: bool = False) -> str | None:
    """How the audit trail writes a pick: 'home 7', 'draw', 'missed', 'away 3 (default)'."""
    if side is None:
        return None
    label = f"{side} {margin}" if side in ("home", "away") else side
    return f"{label} (default)" if is_default else label


def _upsert_pick(
    actor: Actor,
    *,
    member_id: UUID,
    season_membership_id: UUID,
    fixture_id: str,
    recorded_by: UUID,
    values: dict[str, Any],
) -> tuple[str | None, str | None] | None:
    """Inserts or updates the member's pick of a fixture, found by member (a reinstated
    member's earlier pick sits on their withdrawn season membership). Returns the pick's audit
    label before and after, or None when nothing changed. The member's season membership is
    locked first, so two saves of one member's pick queue rather than race."""
    p, sm = t.picks, t.season_memberships
    actor.connection.execute(select(sm.c.id).where(sm.c.id == season_membership_id).with_for_update())
    existing = actor.connection.execute(
        select(p)
        .where(
            p.c.league_id == actor.league_id,
            p.c.season_id == actor.season_id,
            p.c.fixture_id == fixture_id,
            _member_rows(actor, p, member_id),
        )
        .with_for_update()
    ).first()
    after = _pick_label(values["side"], values["margin"], values["is_default"])
    if existing is None:
        actor.connection.execute(
            insert(p).values(
                league_id=actor.league_id,
                season_id=actor.season_id,
                season_membership_id=season_membership_id,
                fixture_id=fixture_id,
                recorded_by_membership_id=recorded_by,
                **values,
            )
        )
        return None, after
    if all(getattr(existing, key) == value for key, value in values.items()):
        return None
    actor.connection.execute(
        update(p)
        .where(p.c.id == existing.id, p.c.version == existing.version)
        .values(**values, recorded_by_membership_id=recorded_by, updated_at=func.now(), version=p.c.version + 1)
    )
    return _pick_label(existing.side, existing.margin, existing.is_default), after


def _picks_record(fixture_id: str, action: str, before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    return {
        "action": action,
        "entity_type": "picks",
        "entity_id": None,
        "before": {"fixtureId": fixture_id, "picks": before},
        "after": {"fixtureId": fixture_id, "picks": after},
    }


def save_own_pick(actor: Actor, fixture_id: str, *, side: str, margin: int | None) -> None:
    """The caller's own pick of a fixture, until its kickoff: 422 `picks_locked` after,
    `invalid_pick` for an impossible pick. A steward's default mark is cleared and a linked
    duty kept."""
    membership_id = require_membership(actor)
    fixture = _fixture(actor, fixture_id)
    if actor.season_membership_id is None:
        raise problem(403, "not_in_season", "You are not enrolled in this season.")
    if locked(fixture, now_utc()):
        raise problem(422, "picks_locked", "This match has kicked off, so picks are locked. Ask your captain to correct a pick.")
    side, margin, _ = check_pick(side, margin, own=True)
    changed = _upsert_pick(
        actor,
        member_id=membership_id,
        season_membership_id=actor.season_membership_id,
        fixture_id=fixture_id,
        recorded_by=membership_id,
        values={"side": side, "margin": margin, "is_default": False},
    )
    if changed is not None:
        before, after = changed
        record(actor, **_picks_record(fixture_id, "picks.recorded", {actor.display_name: before}, {actor.display_name: after}))


@dataclass(frozen=True)
class StewardPick:
    member_id: UUID
    side: str
    margin: int | None
    is_default: bool = False
    # Left out: an existing pick keeps its duty. None clears it.
    duty_id: UUID | None | Any = _UNSET


def record_picks(actor: Actor, fixture_id: str, entries: Sequence[StewardPick]) -> None:
    """Captain or admin records or corrects members' picks of a fixture at any time. Members
    left out keep their picks. A duty must be a pick confirmation duty of that member."""
    recorded_by = require_membership(actor)
    _fixture(actor, fixture_id)
    member_ids = [entry.member_id for entry in entries]
    if len(set(member_ids)) != len(member_ids):
        raise problem(422, "duplicate_member", "Each member can appear once in a fixture's picks.")
    enrolled = _enrolled(actor)
    if any(member_id not in enrolled for member_id in member_ids):
        raise problem(404, "unknown_member", "Every member in the picks must be enrolled in this season.")
    default_picks = rules(actor)["defaultPicks"]
    checked = [
        (entry, check_pick(entry.side, entry.margin, is_default=entry.is_default, default_picks=default_picks))
        for entry in entries
    ]
    duty_ids = {entry.duty_id for entry in entries if entry.duty_id is not _UNSET and entry.duty_id is not None}
    duty_members: dict[UUID, UUID] = {}
    if duty_ids:
        d, sm = t.duties, t.season_memberships
        duty_members = {
            row.id: row.membership_id
            for row in actor.connection.execute(
                select(d.c.id, sm.c.membership_id)
                .select_from(d.join(sm, sm.c.id == d.c.season_membership_id))
                .where(d.c.id.in_(duty_ids), d.c.league_id == actor.league_id, d.c.type == "pick_confirmation")
            ).all()
        }
    for entry in entries:
        if entry.duty_id is not _UNSET and entry.duty_id is not None and duty_members.get(entry.duty_id) != entry.member_id:
            raise problem(404, "unknown_duty", "A linked duty must be a pick confirmation duty of that member.")
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    for entry, (side, margin, is_default) in checked:
        values: dict[str, Any] = {"side": side, "margin": margin, "is_default": is_default}
        if entry.duty_id is not _UNSET:
            values["duty_id"] = entry.duty_id
        member = enrolled[entry.member_id]
        changed = _upsert_pick(
            actor,
            member_id=entry.member_id,
            season_membership_id=member.id,
            fixture_id=fixture_id,
            recorded_by=recorded_by,
            values=values,
        )
        if changed is not None:
            before[member.display_name], after[member.display_name] = changed
    if after:
        record(actor, **_picks_record(fixture_id, "picks.recorded", before, after))


def delete_pick(actor: Actor, fixture_id: str, member_id: UUID) -> None:
    """Captain or admin removes a member's pick of a fixture. Nothing to remove is not an
    error."""
    _fixture(actor, fixture_id)
    member = _league_membership(actor, member_id)
    p = t.picks
    removed = actor.connection.execute(
        p.delete()
        .where(
            p.c.league_id == actor.league_id,
            p.c.season_id == actor.season_id,
            p.c.fixture_id == fixture_id,
            _member_rows(actor, p, member_id),
        )
        .returning(p.c.side, p.c.margin, p.c.is_default)
    ).first()
    if removed is not None:
        label = _pick_label(removed.side, removed.margin, removed.is_default)
        record(actor, **_picks_record(fixture_id, "picks.deleted", {member.display_name: label}, {member.display_name: None}))


def _link_pick(actor: Actor, member_id: UUID, season_membership_id: UUID, fixture_id: str, duty_id: UUID, recorded_by: UUID) -> None:
    """Links the member's pick of a fixture to a pick confirmation duty, recording a `missed`
    pick when there is none."""
    p = t.picks
    existing = actor.connection.execute(
        select(p.c.id)
        .where(
            p.c.league_id == actor.league_id,
            p.c.season_id == actor.season_id,
            p.c.fixture_id == fixture_id,
            _member_rows(actor, p, member_id),
        )
        .with_for_update()
    ).first()
    if existing is not None:
        actor.connection.execute(
            update(p).where(p.c.id == existing.id).values(duty_id=duty_id, updated_at=func.now(), version=p.c.version + 1)
        )
        return
    actor.connection.execute(
        insert(p).values(
            league_id=actor.league_id,
            season_id=actor.season_id,
            season_membership_id=season_membership_id,
            fixture_id=fixture_id,
            side="missed",
            margin=None,
            is_default=False,
            duty_id=duty_id,
            recorded_by_membership_id=recorded_by,
        )
    )


# Evidence -----------------------------------------------------------------------------


def reserve_upload(
    actor: Actor,
    storage: Storage,
    *,
    filename: str,
    content_type: str,
    size_bytes: int,
    max_bytes: int,
    ttl_seconds: int,
) -> dict[str, Any]:
    require_membership(actor)
    if actor.season_membership_id is None:
        raise problem(403, "not_in_season", "You are not enrolled in this season.")
    if not content_type.startswith(VIDEO_TYPES):
        raise problem(422, "not_a_video", "Choose a video file to continue.")
    if size_bytes <= 0 or size_bytes > max_bytes:
        raise problem(422, "too_large", f"Choose a video smaller than {max_bytes // (1024 * 1024)} MB.")
    asset_id = uuid4()
    path = f"{actor.league_id}/{actor.season_id}/{actor.membership_id}/{asset_id}-{secrets.token_urlsafe(8)}"
    expires_at = now_utc() + timedelta(seconds=ttl_seconds)
    try:
        grant = storage.create_signed_upload(path)
    except StorageError as exc:
        raise problem(503, "storage_unavailable", str(exc)) from exc
    actor.connection.execute(
        insert(t.media_assets).values(
            id=asset_id,
            league_id=actor.league_id,
            season_id=actor.season_id,
            uploader_membership_id=actor.membership_id,
            object_path=path,
            filename=filename[:255],
            declared_type=content_type[:100],
            size_bytes=size_bytes,
            status="reserved",
            upload_expires_at=expires_at,
        )
    )
    record(actor, action="media.reserved", entity_type="media_asset", entity_id=asset_id, after={"sizeBytes": size_bytes})
    return {"assetId": asset_id, "bucket": storage.bucket, "path": path, "token": grant.token, "expiresAt": expires_at}


def submit_evidence(
    actor: Actor,
    storage: Storage,
    *,
    asset_id: UUID,
    duty_ids: list[UUID],
    note: str,
    subject_member_id: UUID | None,
    claimed_completed_at: datetime | None,
    max_bytes: int,
) -> UUID:
    submitter_id = require_membership(actor)
    if not duty_ids:
        raise problem(422, "no_duties", "Choose at least one duty.")
    subject_id = subject_member_id or submitter_id
    on_behalf = subject_id != submitter_id
    if on_behalf:
        if not actor.administers:
            raise problem(403, "captain_only", "Only the captain can submit evidence for another member.")
        if claimed_completed_at is None:
            raise problem(422, "completion_time_required", "Record when the duty was completed.")
        if claimed_completed_at > now_utc():
            raise problem(422, "future_completion", "The completion time cannot be in the future.")
    else:
        claimed_completed_at = None

    a = t.media_assets
    asset = actor.connection.execute(select(a).where(a.c.id == asset_id).with_for_update()).first()
    if asset is None or asset.uploader_membership_id != submitter_id:
        raise problem(404, "unknown_asset", "Unknown upload.")
    if asset.status != "reserved":
        raise problem(409, "asset_used", "This upload was already submitted.")
    if asset.upload_expires_at < now_utc():
        raise problem(410, "upload_expired", "The upload grant expired. Choose the video again.")
    try:
        stored = storage.stored_object(asset.object_path)
    except StorageError as exc:
        raise problem(503, "storage_unavailable", str(exc)) from exc
    if stored is None:
        raise problem(409, "upload_missing", "The video has not finished uploading.")
    if stored.content_type is not None and not stored.content_type.startswith(VIDEO_TYPES):
        raise problem(422, "not_a_video", "The uploaded file is not a video.")
    if stored.size_bytes is not None and stored.size_bytes > max_bytes:
        raise problem(422, "too_large", "The uploaded video is too large.")

    d, sm = t.duties, t.season_memberships
    rows = actor.connection.execute(
        select(d.c.id, d.c.status, d.c.type, d.c.round_number, sm.c.membership_id)
        .select_from(d.join(sm, sm.c.id == d.c.season_membership_id))
        .where(d.c.id.in_(duty_ids), d.c.season_id == actor.season_id)
        .with_for_update(of=d)
    ).all()
    if len(rows) != len(set(duty_ids)):
        raise problem(404, "unknown_duty", "Unknown duty.")
    for row in rows:
        if row.membership_id != subject_id:
            raise problem(403, "not_your_duty", "Evidence can only be linked to that member's own duties.")
        if row.status not in ("open", "pending_deadline"):
            raise problem(409, "duty_closed", "That duty is no longer open.")

    actor.connection.execute(
        update(a)
        .where(a.c.id == asset_id)
        .values(
            status="ready",
            detected_type=stored.content_type,
            size_bytes=stored.size_bytes if stored.size_bytes is not None else asset.size_bytes,
            updated_at=func.now(),
        )
    )
    submission_id = actor.connection.execute(
        insert(t.evidence_submissions)
        .values(
            league_id=actor.league_id,
            season_id=actor.season_id,
            submitter_membership_id=submitter_id,
            subject_membership_id=subject_id,
            asset_id=asset_id,
            claimed_completed_at=claimed_completed_at,
            note=note,
        )
        .returning(t.evidence_submissions.c.id)
    ).scalar_one()
    for row in rows:
        actor.connection.execute(
            insert(t.duty_evidence_links).values(league_id=actor.league_id, duty_id=row.id, submission_id=submission_id)
        )
    subject_name = actor.connection.execute(
        select(t.league_memberships.c.display_name).where(
            t.league_memberships.c.id == subject_id, t.league_memberships.c.league_id == actor.league_id
        )
    ).scalar_one()
    titles = ", ".join(duty_title(actor.competition, r.type, r.round_number) for r in rows)
    record(
        actor,
        action="evidence.submitted",
        entity_type="evidence_submission",
        entity_id=submission_id,
        after={"dutyIds": [str(r.id) for r in rows], "onBehalf": on_behalf},
        feed=FeedEntry(
            kind="evidence_submitted",
            title=f"{subject_name} submitted evidence for {titles}.",
            detail=f"Recorded by {actor.display_name}." if on_behalf else "Waiting for an uninvolved reviewer.",
            round_number=rows[0].round_number if len({r.round_number for r in rows}) == 1 else None,
            subject_membership_id=subject_id,
            duty_id=rows[0].id if len(rows) == 1 else None,
            submission_id=submission_id,
        ),
    )
    return submission_id


def decide_link(actor: Actor, link_id: UUID, *, decision: str, reason: str) -> None:
    if decision not in ("accepted", "rejected"):
        raise problem(422, "unknown_decision", "Decision must be accepted or rejected.")
    if not actor.administers:
        raise problem(403, "captain_only", "Only an uninvolved captain can decide evidence.")
    decided_by = require_membership(actor)
    l, s, d, sm = t.duty_evidence_links, t.evidence_submissions, t.duties, t.season_memberships
    row = actor.connection.execute(
        select(
            l.c.id,
            l.c.version,
            l.c.decision,
            l.c.duty_id,
            s.c.submitter_membership_id,
            s.c.subject_membership_id,
            s.c.submitted_at,
            s.c.claimed_completed_at,
            d.c.status.label("duty_status"),
            d.c.type,
            d.c.round_number,
            d.c.version.label("duty_version"),
        )
        .select_from(l.join(s, s.c.id == l.c.submission_id).join(d, d.c.id == l.c.duty_id))
        .where(l.c.id == link_id)
        .with_for_update(of=[l, d])
    ).first()
    if row is None:
        raise problem(404, "unknown_link", "Unknown evidence.")
    if row.subject_membership_id == actor.membership_id:
        raise problem(403, "self_review", "Your own evidence needs an uninvolved reviewer.")
    if row.decision != "pending":
        raise problem(409, "already_decided", "This evidence was already decided.")
    if row.duty_status not in ("open", "pending_deadline"):
        raise problem(409, "duty_closed", "That duty is no longer open.")
    # The member's own submission counts from when it was submitted; the captain's
    # submission on the member's behalf counts from the recorded completion time.
    effective = row.claimed_completed_at if row.submitter_membership_id != row.subject_membership_id else row.submitted_at
    values: dict[str, Any] = {
        "decision": decision,
        "decided_by_membership_id": decided_by,
        "decided_at": func.now(),
        "reason": reason,
        "updated_at": func.now(),
        "version": l.c.version + 1,
    }
    if decision == "accepted":
        values["effective_completed_at"] = effective
    actor.connection.execute(update(l).where(l.c.id == link_id, l.c.version == row.version).values(**values))
    if decision == "accepted":
        actor.connection.execute(
            update(d)
            .where(d.c.id == row.duty_id, d.c.version == row.duty_version)
            .values(status="completed", completed_at=effective, updated_at=func.now(), version=d.c.version + 1)
        )
        actor.connection.execute(
            update(l)
            .where(l.c.duty_id == row.duty_id, l.c.decision == "pending", l.c.id != link_id)
            .values(decision="superseded", updated_at=func.now(), version=l.c.version + 1)
        )
    subject_name = actor.connection.execute(
        select(t.league_memberships.c.display_name).where(
            t.league_memberships.c.id == row.subject_membership_id, t.league_memberships.c.league_id == actor.league_id
        )
    ).scalar_one()
    title = duty_title(actor.competition, row.type, row.round_number)
    record(
        actor,
        action=f"evidence.{decision}",
        entity_type="duty_evidence_link",
        entity_id=link_id,
        reason=reason,
        before={"decision": "pending", "dutyStatus": row.duty_status},
        after={"decision": decision, "effectiveCompletedAt": _iso(effective) if decision == "accepted" else None},
        feed=FeedEntry(
            kind="evidence_accepted" if decision == "accepted" else "evidence_rejected",
            title=f"{subject_name}: {title} {'completed' if decision == 'accepted' else 'evidence rejected'}.",
            detail=reason,
            round_number=row.round_number,
            subject_membership_id=row.subject_membership_id,
            duty_id=row.duty_id,
        ),
    )


def playback_url(actor: Actor, storage: Storage, asset_id: UUID, ttl_seconds: int) -> dict[str, Any]:
    a = t.media_assets
    asset = actor.connection.execute(select(a).where(a.c.id == asset_id)).first()
    if asset is None or asset.status != "ready":
        raise problem(404, "unknown_asset", "Unknown video.")
    try:
        url = storage.signed_url(asset.object_path, ttl_seconds)
    except StorageError as exc:
        raise problem(503, "storage_unavailable", str(exc)) from exc
    return {"url": url, "expiresAt": now_utc() + timedelta(seconds=ttl_seconds), "filename": asset.filename}


# Feed ---------------------------------------------------------------------------------


def feed(actor: Actor, round_number: int | None, limit: int) -> Sequence[Any]:
    f = t.feed_entries
    actor_m = t.league_memberships.alias("actor_m")
    subject_m = t.league_memberships.alias("subject_m")
    query = (
        select(
            f,
            actor_m.c.display_name.label("actor_name"),
            subject_m.c.display_name.label("subject_name"),
        )
        .select_from(
            f.outerjoin(actor_m, actor_m.c.id == f.c.actor_membership_id).outerjoin(
                subject_m, subject_m.c.id == f.c.subject_membership_id
            )
        )
        .where(f.c.league_id == actor.league_id, or_(f.c.season_id == actor.season_id, f.c.season_id.is_(None)))
    )
    if round_number is not None:
        query = query.where(f.c.round_number == round_number)
    return actor.connection.execute(query.order_by(f.c.occurred_at.desc()).limit(limit)).all()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
