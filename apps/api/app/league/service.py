"""League domain operations. Every mutation runs inside the actor's transaction and writes
its audit event and feed entry there, so the three commit or roll back together (I6)."""

import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Sequence
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, func, insert, or_, select, update
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from app.league import tables as t
from app.league.context import Actor, now_utc
from app.league.marks import MarkCalculation, calculate
from app.league.storage import Storage, StorageError
from app.matchcentre.catalogue import club
from app.matchcentre.schedule import load_schedule

REGULAR_ROUNDS = 18
LAST_ROUND = 21
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
    """Append the audit event and, when the change is league-visible, the feed entry."""
    actor.connection.execute(
        insert(t.audit_events).values(
            league_id=actor.league_id,
            actor_membership_id=actor.membership_id,
            actor_label=actor.display_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            reason=reason,
            before=before,
            after=after,
            request_id=actor.request_id,
        )
    )
    if feed is not None:
        actor.connection.execute(
            insert(t.feed_entries).values(
                league_id=actor.league_id,
                season_id=actor.season_id,
                round_number=feed.round_number,
                kind=feed.kind,
                actor_membership_id=actor.membership_id,
                subject_membership_id=feed.subject_membership_id,
                duty_id=feed.duty_id,
                submission_id=feed.submission_id,
                title=feed.title,
                detail=feed.detail,
            )
        )


# Rounds -------------------------------------------------------------------------------


def first_kickoff(round_number: int) -> datetime | None:
    kickoffs = [f.kickoff_utc for f in load_schedule().fixtures if f.round == round_number and f.kickoff_utc]
    return min(kickoffs) if kickoffs else None


def default_deadline(duty_type: str, round_number: int | None) -> datetime | None:
    """Spoon duties are due when the next round kicks off. Other types need an explicit deadline."""
    if duty_type == "spoon" and round_number is not None and round_number < LAST_ROUND:
        return first_kickoff(round_number + 1)
    return None


# Members ------------------------------------------------------------------------------


def members(actor: Actor) -> Sequence[Any]:
    sm = t.season_memberships
    m = t.league_memberships
    return actor.connection.execute(
        select(
            m.c.id,
            m.c.display_name,
            m.c.full_name,
            m.c.status,
            m.c.invited_email,
            m.c.user_id,
            sm.c.id.label("season_membership_id"),
        )
        .select_from(m.outerjoin(sm, and_(sm.c.membership_id == m.c.id, sm.c.season_id == actor.season_id)))
        .where(m.c.league_id == actor.league_id)
        .order_by(m.c.full_name)
    ).all()


def unclaimed_memberships(connection: Connection) -> Sequence[Any]:
    """Names a signed-in account may claim: active, unclaimed and not reserved for an email."""
    m = t.league_memberships
    return connection.execute(
        select(m.c.id, m.c.display_name, m.c.full_name)
        .where(m.c.user_id.is_(None), m.c.status == "active", m.c.invited_email.is_(None))
        .order_by(m.c.full_name)
    ).all()


def claim_membership(connection: Connection, user_id: UUID, membership_id: UUID) -> bool:
    """Binds the account to the chosen name. False when it was taken, reserved or unknown."""
    m = t.league_memberships
    existing = connection.execute(
        select(m.c.id).where(m.c.user_id == user_id, m.c.status == "active")
    ).first()
    if existing is not None:
        raise problem(409, "already_member", "This account already has a Superbru name.")
    claimed = connection.execute(
        update(m)
        .where(
            m.c.id == membership_id,
            m.c.user_id.is_(None),
            m.c.status == "active",
            m.c.invited_email.is_(None),
        )
        .values(user_id=user_id, updated_at=func.now(), version=m.c.version + 1)
        .returning(m.c.id)
    ).first()
    return claimed is not None


def release_membership(actor: Actor, membership_id: UUID) -> None:
    """Captain undoes a claim so the right account can take the name. Not for the captain's own."""
    if membership_id == actor.membership_id:
        raise problem(409, "captain_membership", "The captain's own membership cannot be released.")
    m = t.league_memberships
    row = actor.connection.execute(select(m).where(m.c.id == membership_id).with_for_update()).first()
    if row is None:
        raise problem(404, "unknown_member", "Unknown member.")
    if row.user_id is None:
        raise problem(409, "not_claimed", "That name has not been claimed.")
    actor.connection.execute(
        update(m)
        .where(m.c.id == membership_id, m.c.version == row.version)
        .values(user_id=None, updated_at=func.now(), version=m.c.version + 1)
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
    current = actor.connection.execute(select(m).where(m.c.id == membership_id)).first()
    if current is None:
        raise problem(404, "unknown_member", "Unknown member.")
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
            .where(m.c.id == membership_id)
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


# Own profile --------------------------------------------------------------------------

PHOTO_TYPE = "image/jpeg"


@dataclass(frozen=True)
class Profile:
    favourite_team_id: str | None
    photo_url: str | None


def _photo_prefix(user_id: UUID) -> str:
    return f"avatars/{user_id}/"


def profile(actor: Actor, storage: Storage, url_ttl_seconds: int) -> Profile:
    """The caller's own favourite team and a short-lived URL for their photo."""
    user = actor.connection.execute(
        select(t.users.c.favourite_team_id, t.users.c.photo_path).where(t.users.c.id == actor.user_id)
    ).one()
    photo_url = None
    if user.photo_path:
        try:
            photo_url = storage.signed_url(user.photo_path, url_ttl_seconds)
        except StorageError:
            # The team still loads; the member sees their initials until Storage recovers.
            photo_url = None
    return Profile(user.favourite_team_id, photo_url)


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
    """Changes only the caller's own profile. A new photo must be an upload the caller made."""
    if club(favourite_team_id) is None:
        raise problem(422, "unknown_team", "Choose a URC team.")
    u = t.users
    user = actor.connection.execute(
        select(u.c.favourite_team_id, u.c.photo_path).where(u.c.id == actor.user_id).with_for_update()
    ).one()
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

    actor.connection.execute(
        update(u)
        .where(u.c.id == actor.user_id)
        .values(
            favourite_team_id=favourite_team_id,
            photo_path=new_path,
            photo_updated_at=func.now() if new_path != user.photo_path else u.c.photo_updated_at,
            updated_at=func.now(),
        )
    )
    record(
        actor,
        action="profile.updated",
        entity_type="user",
        entity_id=actor.user_id,
        before={"favouriteTeamId": user.favourite_team_id, "photo": user.photo_path is not None},
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


def _duty_query(actor: Actor):
    d, sm, m = t.duties, t.season_memberships, t.league_memberships
    return (
        select(d, m.c.id.label("member_id"), m.c.display_name.label("member_name"))
        .select_from(d.join(sm, sm.c.id == d.c.season_membership_id).join(m, m.c.id == sm.c.membership_id))
        .where(d.c.season_id == actor.season_id)
    )


def duties(actor: Actor, round_number: int | None = None, duty_id: UUID | None = None) -> list[DutyView]:
    query = _duty_query(actor)
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
    now = now_utc()
    views = []
    for row in rows:
        duty_links = by_duty.get(row.id, [])
        marks = calculate(
            deadline_at=row.deadline_at,
            completed_at=row.completed_at,
            voided=row.status == "voided",
            now=now,
            closure_at=actor.season_closed_at,
            clock_reset_at=row.clock_reset_at,
        )
        views.append(DutyView(row, row.member_id, row.member_name, marks, _display(row, duty_links, now), duty_links))
    return views


def _display(row: Any, links: list[Any], now: datetime) -> str:
    if row.status != "open":
        return row.status
    if any(link.decision == "pending" for link in links):
        return "under_review"
    return "overdue" if row.deadline_at is not None and now > row.deadline_at else "open"


def round_label(round_number: int) -> str:
    code = str(round_number).zfill(2) if round_number <= REGULAR_ROUNDS else {19: "QF", 20: "SF", 21: "F"}[round_number]
    return f"Round {code}"


def duty_title(duty_type: str, round_number: int | None) -> str:
    label = "Spoon duty" if duty_type == "spoon" else "Pick confirmation"
    if round_number is None:
        return label
    return f"{round_label(round_number)} {label}"


def create_duty(
    actor: Actor,
    *,
    member_id: UUID,
    duty_type: str,
    round_number: int | None,
    deadline_at: datetime | None,
    reason: str,
) -> UUID:
    if duty_type not in DUTY_TYPES:
        raise problem(422, "unknown_duty_type", "Unknown duty type.")
    sm = t.season_memberships
    season_membership_id = actor.connection.execute(
        select(sm.c.id).where(
            sm.c.season_id == actor.season_id, sm.c.membership_id == member_id, sm.c.status == "active"
        )
    ).scalar_one_or_none()
    if season_membership_id is None:
        raise problem(404, "unknown_member", "That member is not enrolled in this season.")
    if deadline_at is None:
        deadline_at = default_deadline(duty_type, round_number)
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
                    created_by_membership_id=actor.membership_id,
                )
                .returning(t.duties.c.id)
            ).scalar_one()
    except IntegrityError as exc:
        raise problem(409, "duplicate_duty", "That member already has a live duty of this type in this round.") from exc
    member_name = actor.connection.execute(
        select(t.league_memberships.c.display_name).where(t.league_memberships.c.id == member_id)
    ).scalar_one()
    title = duty_title(duty_type, round_number)
    record(
        actor,
        action="duty.created",
        entity_type="duty",
        entity_id=duty_id,
        reason=reason,
        after={"type": duty_type, "roundNumber": round_number, "deadlineAt": _iso(deadline_at), "status": status},
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
            title=f"{view.member_name}: {duty_title(row.type, row.round_number)} voided.",
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
            title=f"{view.member_name}: {duty_title(row.type, row.round_number)} clock reset.",
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
    """Round points per member in the active season. Ranks are derived here: tied points share
    a rank and the next rank skips (1, 2, 2, 4). Ties list alphabetically."""
    rs = t.round_standings
    sm = t.season_memberships
    m = t.league_memberships
    query = (
        select(rs.c.round_number, rs.c.points, m.c.id.label("member_id"), m.c.display_name)
        .select_from(rs.join(sm, sm.c.id == rs.c.season_membership_id).join(m, m.c.id == sm.c.membership_id))
        .where(rs.c.league_id == actor.league_id, rs.c.season_id == actor.season_id)
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
    """Replaces a round's Superbru table with the captain's copy of the pool results. Members
    left out lose their row for the round. Unchanged rows are left alone."""
    member_ids = [member_id for member_id, _ in entries]
    if len(set(member_ids)) != len(member_ids):
        raise problem(422, "duplicate_member", "Each member can appear once in a round's standings.")
    sm = t.season_memberships
    m = t.league_memberships
    enrolled = {
        row.membership_id: row
        for row in actor.connection.execute(
            select(sm.c.id, sm.c.membership_id, m.c.display_name)
            .select_from(sm.join(m, m.c.id == sm.c.membership_id))
            .where(sm.c.season_id == actor.season_id, sm.c.status == "active")
        ).all()
    }
    unknown = [member_id for member_id in member_ids if member_id not in enrolled]
    if unknown:
        raise problem(404, "unknown_member", "Every member in the standings must be enrolled in this season.")
    rs = t.round_standings
    existing = {
        row.season_membership_id: row
        for row in actor.connection.execute(
            select(rs)
            .where(rs.c.season_id == actor.season_id, rs.c.round_number == round_number)
            .with_for_update()
        ).all()
    }
    wanted = {enrolled[member_id].id: points for member_id, points in entries}
    name_of = {row.id: row.display_name for row in enrolled.values()}
    before = {name_of.get(key, str(key)): float(row.points) for key, row in existing.items()}
    after = {name_of[key]: float(points) for key, points in wanted.items()}
    if before == after:
        return
    removed = [row.id for key, row in existing.items() if key not in wanted]
    if removed:
        actor.connection.execute(rs.delete().where(rs.c.id.in_(removed)))
    for season_membership_id, points in wanted.items():
        current = existing.get(season_membership_id)
        if current is None:
            actor.connection.execute(
                insert(rs).values(
                    league_id=actor.league_id,
                    season_id=actor.season_id,
                    season_membership_id=season_membership_id,
                    round_number=round_number,
                    points=points,
                    recorded_by_membership_id=actor.membership_id,
                )
            )
        elif current.points != points:
            actor.connection.execute(
                update(rs)
                .where(rs.c.id == current.id)
                .values(
                    points=points,
                    recorded_by_membership_id=actor.membership_id,
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
            title=f"{round_label(round_number)} Superbru standings updated.",
            detail=detail,
            round_number=round_number,
        ),
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
    if not duty_ids:
        raise problem(422, "no_duties", "Choose at least one duty.")
    subject_id = subject_member_id or actor.membership_id
    on_behalf = subject_id != actor.membership_id
    if on_behalf:
        if not actor.is_captain:
            raise problem(403, "captain_only", "Only the captain can submit evidence for another member.")
        if claimed_completed_at is None:
            raise problem(422, "completion_time_required", "Record when the duty was completed.")
        if claimed_completed_at > now_utc():
            raise problem(422, "future_completion", "The completion time cannot be in the future.")
    else:
        claimed_completed_at = None

    a = t.media_assets
    asset = actor.connection.execute(select(a).where(a.c.id == asset_id).with_for_update()).first()
    if asset is None or asset.uploader_membership_id != actor.membership_id:
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
            submitter_membership_id=actor.membership_id,
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
        select(t.league_memberships.c.display_name).where(t.league_memberships.c.id == subject_id)
    ).scalar_one()
    titles = ", ".join(duty_title(r.type, r.round_number) for r in rows)
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
    if not actor.is_captain:
        raise problem(403, "captain_only", "Only an uninvolved captain can decide evidence.")
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
        "decided_by_membership_id": actor.membership_id,
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
        select(t.league_memberships.c.display_name).where(t.league_memberships.c.id == row.subject_membership_id)
    ).scalar_one()
    title = duty_title(row.type, row.round_number)
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
