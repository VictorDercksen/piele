"""League events that queue a push message, inside the transaction of the change and its feed
entry (service.write_record), so a message exists exactly when the change committed.

- `duty_created`: the duty's member.
- `evidence_submitted`: the voters of the cases the submission opened.
- `evidence_vetoed`: whoever may rule on the veto: the captain unless involved, then the
  league's stand-in reviewer unless involved too.
- `evidence_accepted` / `evidence_rejected`: the duty's member.

Nobody is sent a message about their own action, and a member who turned the kind off in
this league (outbox.muted) gets none. Runs in the league's context; the job sends later.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Iterable
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.engine import Connection

from app import competitions
from app.league import tables as t
from app.push.outbox import DEFAULT_LIFETIME, Message, enqueue, muted

if TYPE_CHECKING:
    from app.league.service import FeedEntry

KINDS = ("duty_created", "evidence_submitted", "evidence_vetoed", "evidence_accepted", "evidence_rejected")


def when(moment: datetime, zone: str) -> str:
    """`Fri 3 Oct, 19:45` in the league's time zone."""
    local = moment.astimezone(ZoneInfo(zone))
    return f"{local:%a} {local.day} {local:%b}, {local:%H:%M}"


def queue_for_feed(
    connection: Connection,
    *,
    league_id: UUID,
    season_id: UUID | None,
    actor_membership_id: UUID | None,
    feed: "FeedEntry",
    now: datetime,
) -> None:
    if feed.kind not in KINDS or season_id is None:
        return
    lg, s = t.leagues, t.seasons
    league = connection.execute(
        select(lg.c.slug, lg.c.timezone, lg.c.captain_membership_id, lg.c.stand_in_reviewer_membership_id).where(
            lg.c.id == league_id
        )
    ).one()
    competition_id = connection.execute(select(s.c.competition_id).where(s.c.id == season_id)).scalar_one()
    competition = competitions.ALL.get(competition_id)
    if competition is None:
        return
    duty = None
    if feed.duty_id is not None:
        d = t.duties
        duty = connection.execute(
            select(d.c.id, d.c.type, d.c.round_number, d.c.deadline_at, d.c.season_membership_id).where(d.c.id == feed.duty_id)
        ).one()
    from app.league.service import duty_title

    def title_of(row) -> str:
        return duty_title(competition, row.type, row.round_number)

    base = f"/{league.slug}"
    expires = now + DEFAULT_LIFETIME
    messages: list[tuple[UUID, str, str, str, str, str, str]] = []  # member, kind, key, title, body, url, tag

    if feed.kind == "duty_created" and duty is not None and feed.subject_membership_id is not None:
        due = f"Due {when(duty.deadline_at, league.timezone)}." if duty.deadline_at else "Deadline to be confirmed."
        messages.append(
            (
                feed.subject_membership_id,
                "duty_created",
                f"duty_created:{duty.id}",
                "A duty for you",
                f"{title_of(duty)}. {due}",
                f"{base}/duties",
                f"duty:{duty.id}",
            )
        )
    elif feed.kind == "evidence_submitted" and feed.submission_id is not None:
        for case in _opened_cases(connection, feed.submission_id):
            for voter in _voters(connection, case.id):
                messages.append(
                    (
                        voter,
                        "case_vote",
                        f"case_vote:{feed.submission_id}",
                        "Evidence to review",
                        f"{case.subject_name}: {duty_title(competition, case.type, case.round_number)}. "
                        "Accept or veto it within 24 hours.",
                        f"{base}/decisions",
                        f"case-vote:{feed.submission_id}",
                    )
                )
    elif feed.kind == "evidence_vetoed" and duty is not None:
        veto = _pending_veto(connection, duty.id)
        if veto is not None:
            reviewer = _reviewer(
                veto.subject_membership_id, veto.vetoer_id, league.captain_membership_id, league.stand_in_reviewer_membership_id
            )
            if reviewer is not None:
                page = "captain" if reviewer == league.captain_membership_id else "decisions"
                messages.append(
                    (
                        reviewer,
                        "case_review",
                        f"case_review:{veto.voter_id}",
                        "A veto needs your ruling",
                        f"{veto.subject_name}: {title_of(duty)} evidence was vetoed.",
                        f"{base}/{page}",
                        f"case-review:{veto.case_id}",
                    )
                )
    elif feed.kind in ("evidence_accepted", "evidence_rejected") and duty is not None and feed.subject_membership_id:
        accepted = feed.kind == "evidence_accepted"
        messages.append(
            (
                feed.subject_membership_id,
                "evidence_decided",
                f"evidence_decided:{uuid4()}",
                "Evidence accepted" if accepted else "Evidence rejected",
                f"{title_of(duty)} is complete." if accepted else f"{title_of(duty)}: {feed.detail or 'the evidence was rejected.'}",
                f"{base}/duties",
                f"evidence:{duty.id}",
            )
        )

    members = {member for member, *_ in messages if member != actor_membership_id}
    recipients = _recipients(connection, league_id, members)
    queued: list[Message] = []
    seen: set[tuple[UUID, str]] = set()
    for member, kind, key, title, body, url, tag in messages:
        recipient = recipients.get(member)
        if recipient is None or muted(recipient[1], kind):
            continue
        user_id = recipient[0]
        if (user_id, key) in seen:
            continue
        seen.add((user_id, key))
        queued.append(Message(user_id, league_id, kind, f"{key}:{user_id}", title, body, url, tag, expires))
    enqueue(connection, queued)


def _recipients(connection: Connection, league_id: UUID, members: Iterable[UUID]) -> dict[UUID, tuple[UUID, object]]:
    """Active, claimed memberships: their account and muted kinds."""
    members = list(members)
    if not members:
        return {}
    m = t.league_memberships
    rows = connection.execute(
        select(m.c.id, m.c.user_id, m.c.push_muted).where(
            m.c.league_id == league_id, m.c.id.in_(members), m.c.status == "active", m.c.user_id.is_not(None)
        )
    ).all()
    return {row.id: (row.user_id, row.push_muted) for row in rows}


def _opened_cases(connection: Connection, submission_id: UUID):
    c, link, d, m = t.evidence_cases, t.duty_evidence_links, t.duties, t.league_memberships
    return connection.execute(
        select(c.c.id, d.c.type, d.c.round_number, m.c.display_name.label("subject_name"))
        .select_from(
            c.join(link, link.c.id == c.c.link_id)
            .join(d, d.c.id == c.c.duty_id)
            .join(m, m.c.id == c.c.subject_membership_id)
        )
        .where(link.c.submission_id == submission_id, c.c.status == "open")
    ).all()


def _voters(connection: Connection, case_id: UUID) -> list[UUID]:
    v = t.evidence_case_voters
    return list(connection.execute(select(v.c.membership_id).where(v.c.case_id == case_id, v.c.choice.is_(None))).scalars())


def _pending_veto(connection: Connection, duty_id: UUID):
    c, v, m = t.evidence_cases, t.evidence_case_voters, t.league_memberships
    return connection.execute(
        select(
            c.c.id.label("case_id"),
            c.c.subject_membership_id,
            v.c.id.label("voter_id"),
            v.c.membership_id.label("vetoer_id"),
            m.c.display_name.label("subject_name"),
        )
        .select_from(c.join(v, v.c.case_id == c.c.id).join(m, m.c.id == c.c.subject_membership_id))
        .where(c.c.duty_id == duty_id, c.c.status == "in_review", v.c.review_status == "pending")
        .order_by(v.c.responded_at.desc())
        .limit(1)
    ).first()


def _reviewer(subject_id: UUID, vetoer_id: UUID, captain_id: UUID, stand_in_id: UUID | None) -> UUID | None:
    """Mirrors cases.may_review for members: the captain unless involved, else the stand-in
    unless involved."""
    involved = {subject_id, vetoer_id}
    if captain_id not in involved:
        return captain_id
    if stand_in_id is not None and stand_in_id not in involved:
        return stand_in_id
    return None
