"""Evidence cases (20260928090000_evidence_cases.sql). Every evidence link opens a case that
the league's other members vote on for 24 hours; the first of these events decides it:

- accepts reach a majority of the electorate: the evidence is accepted at once;
- a veto (with a reason) arrives: voting stops and the case waits for a reviewer, who
  upholds the veto (the evidence is rejected, the duty stays open) or dismisses it (voting
  reopens on the original timer, and the evidence is accepted at once if a majority already
  accepted or the time has run out);
- the window closes with neither: the evidence is accepted automatically.

The electorate is frozen when the case opens: the league's active members other than the
duty's member and the submitter. With nobody to vote, the evidence is accepted straight
away. Accepted evidence completes the duty from the same effective time as the captain's
decision (service.effective_completion), so the window costs no marks.

The captain reviews vetoes unless involved (the captain's own duty, or the captain's veto);
then the league's stand-in reviewer does, unless they are involved too. The admin acting
without a membership is never involved. With nobody eligible the case stays in review and
reports that it needs an uninvolved reviewer. The captain's override (service.decide_link)
closes a case at any time.

There is no scheduler. `settle_due` accepts every open case past its closes_at, dated
closes_at, inside the transaction of the next request that reads or writes duties, cases,
marks or the feed. Every case write locks the duty first, then the case.

Ballots are private: no response says whose a vote or veto is, feed entries about a case
name no actor, and the audit trail records votes only through the case's transitions.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import func, insert, select, update
from sqlalchemy.engine import Connection

from app.league import service
from app.league import tables as t
from app.league.context import Actor, require_membership

VOTING_HOURS = 24
VOTING_WINDOW = timedelta(hours=VOTING_HOURS)
LIVE = ("open", "in_review")
# Audit labels for case transitions nobody in particular caused: settlement after the
# window closed, and a vote that tipped the case (the voter stays anonymous).
SYSTEM_LABEL = "system"
ANONYMOUS_LABEL = "anonymous member"


def majority(accepts: int, eligible: int) -> bool:
    """More than half of the electorate accepted."""
    return accepts * 2 > eligible


# Locks and supersession -------------------------------------------------------------------


def lock_duty(connection: Connection, duty_id: UUID) -> None:
    """Every evidence and case write takes the duty's lock first, so writes to one duty's
    cases queue behind each other and never deadlock."""
    connection.execute(select(t.duties.c.id).where(t.duties.c.id == duty_id).with_for_update())


def supersede(connection: Connection, link_ids: Sequence[UUID]) -> None:
    """Closes the live cases of evidence that was superseded."""
    if not link_ids:
        return
    c = t.evidence_cases
    connection.execute(
        update(c)
        .where(c.c.link_id.in_(link_ids), c.c.status.in_(LIVE))
        .values(status="superseded", resolved_at=func.now(), updated_at=func.now(), version=c.c.version + 1)
    )


def close_by_captain(connection: Connection, case_id: UUID | None, decision: str) -> str | None:
    """The captain's override closes the evidence's live case with resolution `captain`.
    Returns the case's status afterwards (None for evidence without a case)."""
    if case_id is None:
        return None
    c = t.evidence_cases
    status = "accepted" if decision == "accepted" else "rejected"
    closed = connection.execute(
        update(c)
        .where(c.c.id == case_id, c.c.status.in_(LIVE))
        .values(
            status=status,
            resolution="captain",
            resolved_at=func.now(),
            updated_at=func.now(),
            version=c.c.version + 1,
        )
        .returning(c.c.status)
    ).scalar_one_or_none()
    if closed is not None:
        return closed
    return connection.execute(select(c.c.status).where(c.c.id == case_id)).scalar_one()


def _case_for_update(actor: Actor, case_id: UUID) -> Any:
    """The case in the actor's league, locked after its duty, or 404 `unknown_case`."""
    c = t.evidence_cases
    duty_id = actor.connection.execute(
        select(c.c.duty_id).where(c.c.id == case_id, c.c.league_id == actor.league_id)
    ).scalar_one_or_none()
    if duty_id is None:
        raise service.problem(404, "unknown_case", "Unknown evidence case.")
    lock_duty(actor.connection, duty_id)
    return actor.connection.execute(select(c).where(c.c.id == case_id).with_for_update()).one()


# Recording --------------------------------------------------------------------------------


def _log(actor: Actor, label: str | None, **kwargs: Any) -> None:
    """The audit event (and feed entry): attributed to the actor when `label` is None, else
    to nobody under `label`."""
    if label is None:
        service.record(actor, **kwargs)
        return
    service.write_record(
        actor.connection,
        league_id=actor.league_id,
        season_id=actor.season_id,
        actor_membership_id=None,
        actor_label=label,
        request_id=actor.request_id,
        **kwargs,
    )


def _subject_name(actor: Actor, membership_id: UUID) -> str:
    m = t.league_memberships
    return actor.connection.execute(
        select(m.c.display_name).where(m.c.id == membership_id, m.c.league_id == actor.league_id)
    ).scalar_one()


def _close(
    actor: Actor,
    case: Any,
    *,
    decision: str,
    resolution: str,
    at: datetime,
    reason: str,
    detail: str,
    label: str | None,
    decided_by: UUID | None = None,
) -> None:
    """Accepts or rejects the case's evidence (service.apply_decision) and closes the case,
    with its audit event and a feed entry dated `at` for the league and the duty's member."""
    connection = actor.connection
    link = service.evidence_link_for_update(connection, case.link_id)
    if link.decision != "pending" or link.duty_status not in ("open", "pending_deadline"):
        # Unreachable while every path that closes a duty or its evidence supersedes the case.
        supersede(connection, [case.link_id])
        return
    service.apply_decision(connection, link, decision=decision, reason=reason, decided_by=decided_by, decided_at=at)
    c = t.evidence_cases
    connection.execute(
        update(c)
        .where(c.c.id == case.id)
        .values(status=decision, resolution=resolution, resolved_at=at, updated_at=func.now(), version=c.c.version + 1)
    )
    title = service.duty_title(actor.competition, link.type, link.round_number)
    subject = _subject_name(actor, case.subject_membership_id)
    accepted = decision == "accepted"
    _log(
        actor,
        label,
        action=f"evidence_case.{decision}",
        entity_type="evidence_case",
        entity_id=case.id,
        reason=reason,
        before={"status": case.status},
        after={
            "status": decision,
            "resolution": resolution,
            "resolvedAt": service._iso(at),
            "effectiveCompletedAt": service._iso(service.effective_completion(link)) if accepted else None,
        },
        feed=service.FeedEntry(
            kind="evidence_accepted" if accepted else "evidence_rejected",
            title=f"{subject}: {title} {'completed' if accepted else 'evidence rejected'}.",
            detail=detail,
            round_number=link.round_number,
            subject_membership_id=case.subject_membership_id,
            duty_id=link.duty_id,
            occurred_at=at,
            hide_actor=True,
        ),
    )


def _accept(actor: Actor, case: Any, *, resolution: str, at: datetime, label: str | None, detail: str) -> None:
    reasons = {
        "majority": "Accepted by a majority of members.",
        "auto": f"No veto within {VOTING_HOURS} hours.",
        "no_voters": "No other member could vote.",
    }
    _close(actor, case, decision="accepted", resolution=resolution, at=at, reason=reasons[resolution], detail=detail, label=label)


def _accepts(connection: Connection, case_id: UUID) -> int:
    v = t.evidence_case_voters
    return connection.execute(
        select(func.count()).select_from(v).where(v.c.case_id == case_id, v.c.choice == "accept")
    ).scalar_one()


# Opening and settling -----------------------------------------------------------------------


@dataclass(frozen=True)
class Opened:
    id: UUID
    eligible_count: int


def open_case(
    actor: Actor,
    *,
    link_id: UUID,
    duty_id: UUID,
    subject_id: UUID,
    submitter_id: UUID,
    subject_name: str,
    title: str,
    round_number: int | None,
) -> Opened:
    """Opens the case for a new evidence link (service.submit_evidence holds the duty's
    lock) with its frozen electorate. Nobody to vote accepts the evidence at once; the
    submission's feed entry says so."""
    connection = actor.connection
    m, c, v = t.league_memberships, t.evidence_cases, t.evidence_case_voters
    electorate = connection.execute(
        select(m.c.id).where(
            m.c.league_id == actor.league_id,
            m.c.status == "active",
            m.c.id.not_in([subject_id, submitter_id]),
        )
    ).scalars().all()
    opened_at = service.now_utc()
    case = connection.execute(
        insert(c)
        .values(
            league_id=actor.league_id,
            season_id=actor.season_id,
            duty_id=duty_id,
            link_id=link_id,
            subject_membership_id=subject_id,
            opened_at=opened_at,
            closes_at=opened_at + VOTING_WINDOW,
            eligible_count=len(electorate),
        )
        .returning(c)
    ).one()
    if electorate:
        connection.execute(
            insert(v), [{"league_id": actor.league_id, "case_id": case.id, "membership_id": member} for member in electorate]
        )
    service.record(
        actor,
        action="evidence_case.opened",
        entity_type="evidence_case",
        entity_id=case.id,
        after={"linkId": str(link_id), "eligibleCount": len(electorate), "closesAt": service._iso(case.closes_at)},
    )
    if not electorate:
        # The submission's feed entry reports the outcome; this records the case's.
        link = service.evidence_link_for_update(connection, link_id)
        service.apply_decision(
            connection, link, decision="accepted", reason="No other member could vote.", decided_by=None, decided_at=opened_at
        )
        connection.execute(
            update(c)
            .where(c.c.id == case.id)
            .values(status="accepted", resolution="no_voters", resolved_at=opened_at, version=c.c.version + 1)
        )
        service.record(
            actor,
            action="evidence_case.accepted",
            entity_type="evidence_case",
            entity_id=case.id,
            before={"status": "open"},
            after={"status": "accepted", "resolution": "no_voters", "resolvedAt": service._iso(opened_at)},
        )
    return Opened(case.id, len(electorate))


def settle_due(actor: Actor) -> None:
    """Accepts every open case of the league whose window has closed, dated when it closed,
    inside the caller's transaction. Idempotent: a case another request settled first is no
    longer open once its duty's lock is granted, and is skipped."""
    c = t.evidence_cases
    now = service.now_utc()
    due = actor.connection.execute(
        select(c.c.id, c.c.duty_id)
        .where(c.c.league_id == actor.league_id, c.c.status == "open", c.c.closes_at <= now)
        .order_by(c.c.duty_id, c.c.id)
    ).all()
    for row in due:
        lock_duty(actor.connection, row.duty_id)
        case = actor.connection.execute(select(c).where(c.c.id == row.id).with_for_update()).one()
        if case.status != "open" or case.closes_at > now:
            continue
        _accept(
            actor,
            case,
            resolution="auto",
            at=case.closes_at,
            label=SYSTEM_LABEL,
            detail=f"No veto within {VOTING_HOURS} hours.",
        )


# Responding and reviewing -------------------------------------------------------------------


def respond(actor: Actor, case_id: UUID, *, choice: str, reason: str) -> "CaseView":
    """An eligible voter accepts, or vetoes with a reason, while voting is open. An accept
    may become a veto; a veto is final."""
    member_id = require_membership(actor)
    if choice not in ("accept", "veto"):
        raise service.problem(422, "unknown_choice", "Choose accept or veto.")
    if choice == "veto" and not reason:
        raise service.problem(422, "reason_required", "Say why you veto this evidence.")
    settle_due(actor)
    case = _case_for_update(actor, case_id)
    v = t.evidence_case_voters
    voter = actor.connection.execute(
        select(v).where(v.c.case_id == case.id, v.c.membership_id == member_id).with_for_update()
    ).first()
    if voter is None:
        raise service.problem(403, "not_a_voter", "You cannot vote on this evidence.")
    if case.status != "open":
        raise service.problem(409, "voting_closed", "Voting on this evidence has closed.")
    if voter.choice == "veto":
        raise service.problem(409, "veto_final", "Your veto stands and cannot be changed.")
    now = service.now_utc()
    if choice == "accept":
        if voter.choice != "accept":
            actor.connection.execute(
                update(v)
                .where(v.c.id == voter.id)
                .values(choice="accept", responded_at=now, updated_at=func.now(), version=v.c.version + 1)
            )
            if majority(_accepts(actor.connection, case.id), case.eligible_count):
                _accept(actor, case, resolution="majority", at=now, label=ANONYMOUS_LABEL, detail="Accepted by a majority of members.")
        return case_views(actor, case_id=case.id)[0]

    actor.connection.execute(
        update(v)
        .where(v.c.id == voter.id)
        .values(
            choice="veto",
            veto_reason=reason,
            responded_at=now,
            review_status="pending",
            updated_at=func.now(),
            version=v.c.version + 1,
        )
    )
    c = t.evidence_cases
    actor.connection.execute(
        update(c).where(c.c.id == case.id).values(status="in_review", updated_at=func.now(), version=c.c.version + 1)
    )
    duty = actor.connection.execute(
        select(t.duties.c.type, t.duties.c.round_number).where(t.duties.c.id == case.duty_id)
    ).one()
    _log(
        actor,
        ANONYMOUS_LABEL,
        action="evidence_case.vetoed",
        entity_type="evidence_case",
        entity_id=case.id,
        before={"status": "open"},
        after={"status": "in_review"},
        feed=service.FeedEntry(
            kind="evidence_vetoed",
            title=f"{_subject_name(actor, case.subject_membership_id)}: "
            f"{service.duty_title(actor.competition, duty.type, duty.round_number)} evidence vetoed.",
            detail="Waiting for an uninvolved reviewer.",
            round_number=duty.round_number,
            subject_membership_id=case.subject_membership_id,
            duty_id=case.duty_id,
            hide_actor=True,
        ),
    )
    return case_views(actor, case_id=case.id)[0]


def _involved(case: Any, vetoer_id: UUID) -> set[UUID]:
    return {case.subject_membership_id, vetoer_id}


def may_review(actor: Actor, case: Any, vetoer_id: UUID, stand_in_id: UUID | None) -> bool:
    """Whether the actor may rule on the case's pending veto. The admin without a
    membership always may; nobody may rule on their own duty or their own veto. The captain
    reviews unless involved, the stand-in only when the captain is; the admin holding a
    membership, like the captain, whenever uninvolved."""
    if actor.membership_id is None:
        return actor.is_admin
    involved = _involved(case, vetoer_id)
    if actor.membership_id in involved:
        return False
    if actor.is_captain or actor.is_admin:
        return True
    return actor.captain_membership_id in involved and actor.membership_id == stand_in_id


def needs_reviewer(case: Any, vetoer_id: UUID, captain_id: UUID, stand_in_id: UUID | None) -> bool:
    """No member may rule on the veto: the captain is involved and there is no uninvolved
    stand-in. Only the admin can then."""
    involved = _involved(case, vetoer_id)
    return captain_id in involved and (stand_in_id is None or stand_in_id in involved)


def _stand_in_id(actor: Actor) -> UUID | None:
    lg = t.leagues
    return actor.connection.execute(
        select(lg.c.stand_in_reviewer_membership_id).where(lg.c.id == actor.league_id)
    ).scalar_one()


def review(actor: Actor, case_id: UUID, *, ruling: str, reason: str) -> "CaseView":
    """Rules on the case's pending veto. Upheld rejects the evidence (the duty stays open for
    new evidence); dismissed reopens voting on the original timer and accepts the evidence
    at once if a majority already accepted or the window has closed."""
    if ruling not in ("upheld", "dismissed"):
        raise service.problem(422, "unknown_ruling", "Rule the veto upheld or dismissed.")
    if not reason:
        raise service.problem(422, "reason_required", "Give a reason for the ruling.")
    settle_due(actor)
    case = _case_for_update(actor, case_id)
    if case.status != "in_review":
        raise service.problem(409, "not_in_review", "This evidence has no veto waiting for review.")
    v = t.evidence_case_voters
    veto = actor.connection.execute(
        select(v).where(v.c.case_id == case.id, v.c.review_status == "pending").with_for_update()
    ).one()
    if not may_review(actor, case, veto.membership_id, _stand_in_id(actor)):
        raise service.problem(403, "not_reviewer", "This veto needs an uninvolved reviewer.")
    now = service.now_utc()
    actor.connection.execute(
        update(v)
        .where(v.c.id == veto.id)
        .values(
            review_status=ruling,
            reviewed_by_membership_id=actor.membership_id,
            reviewed_by_label=service.audit_label(actor),
            reviewed_at=now,
            review_reason=reason,
            updated_at=func.now(),
            version=v.c.version + 1,
        )
    )
    if ruling == "upheld":
        _close(
            actor,
            case,
            decision="rejected",
            resolution="veto_upheld",
            at=now,
            reason=reason,
            detail=reason,
            label=None,
            decided_by=actor.membership_id,
        )
        return case_views(actor, case_id=case.id)[0]

    c = t.evidence_cases
    actor.connection.execute(
        update(c).where(c.c.id == case.id).values(status="open", updated_at=func.now(), version=c.c.version + 1)
    )
    reopened = actor.connection.execute(select(c).where(c.c.id == case.id)).one()
    if majority(_accepts(actor.connection, case.id), case.eligible_count):
        _accept(actor, reopened, resolution="majority", at=now, label=None, detail=f"Veto dismissed: {reason}")
    elif now >= case.closes_at:
        _accept(actor, reopened, resolution="auto", at=now, label=None, detail=f"Veto dismissed: {reason}")
    else:
        duty = actor.connection.execute(
            select(t.duties.c.type, t.duties.c.round_number).where(t.duties.c.id == case.duty_id)
        ).one()
        service.record(
            actor,
            action="evidence_case.veto_dismissed",
            entity_type="evidence_case",
            entity_id=case.id,
            reason=reason,
            before={"status": "in_review"},
            after={"status": "open", "closesAt": service._iso(case.closes_at)},
            feed=service.FeedEntry(
                kind="evidence_veto_dismissed",
                title=f"{_subject_name(actor, case.subject_membership_id)}: "
                f"{service.duty_title(actor.competition, duty.type, duty.round_number)} veto dismissed.",
                detail=f"{reason} Voting reopens until the original closing time.",
                round_number=duty.round_number,
                subject_membership_id=case.subject_membership_id,
                duty_id=case.duty_id,
                hide_actor=True,
            ),
        )
    return case_views(actor, case_id=case.id)[0]


# Reading ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class CaseView:
    row: Any
    duty_title: str
    responded_count: int
    # The caller's own ballot: whether they are in the electorate, their response (and their
    # own veto's reason), and whether they can still respond.
    is_voter: bool
    my_response: str | None
    my_veto_reason: str | None
    can_respond: bool
    # Only for whoever may rule on the pending veto: the veto's reason.
    can_review: bool
    veto_reason: str | None
    # Shown to the captain, the admin and the stand-in: nobody in the league may review.
    needs_reviewer: bool


def list_cases(actor: Actor, round_number: int | None = None) -> list[CaseView]:
    """The season's cases, newest first, optionally for one round. Settles due cases first."""
    settle_due(actor)
    return case_views(actor, round_number=round_number)


def case_views(actor: Actor, *, round_number: int | None = None, case_id: UUID | None = None) -> list[CaseView]:
    c, d, l, s, v = t.evidence_cases, t.duties, t.duty_evidence_links, t.evidence_submissions, t.evidence_case_voters
    subject = t.league_memberships.alias("subject_m")
    submitter = t.league_memberships.alias("submitter_m")
    query = (
        select(
            c,
            d.c.type.label("duty_type"),
            d.c.round_number,
            l.c.submission_id,
            s.c.asset_id,
            s.c.submitted_at,
            s.c.note,
            s.c.submitter_membership_id,
            subject.c.display_name.label("subject_name"),
            submitter.c.display_name.label("submitter_name"),
        )
        .select_from(
            c.join(d, d.c.id == c.c.duty_id)
            .join(l, l.c.id == c.c.link_id)
            .join(s, s.c.id == l.c.submission_id)
            .join(subject, subject.c.id == c.c.subject_membership_id)
            .join(submitter, submitter.c.id == s.c.submitter_membership_id)
        )
        .where(c.c.league_id == actor.league_id, c.c.season_id == actor.season_id)
    )
    if round_number is not None:
        query = query.where(d.c.round_number == round_number)
    if case_id is not None:
        query = query.where(c.c.id == case_id)
    rows = actor.connection.execute(query.order_by(c.c.opened_at.desc(), c.c.id)).all()
    if not rows:
        return []
    ids = [row.id for row in rows]
    responded = dict(
        actor.connection.execute(
            select(v.c.case_id, func.count(v.c.responded_at)).where(v.c.case_id.in_(ids)).group_by(v.c.case_id)
        ).all()
    )
    mine: dict[UUID, Any] = {}
    if actor.membership_id is not None:
        for ballot in actor.connection.execute(
            select(v.c.case_id, v.c.choice, v.c.veto_reason).where(
                v.c.case_id.in_(ids), v.c.membership_id == actor.membership_id
            )
        ).all():
            mine[ballot.case_id] = ballot
    vetoes = {
        veto.case_id: veto
        for veto in actor.connection.execute(
            select(v.c.case_id, v.c.membership_id, v.c.veto_reason).where(
                v.c.case_id.in_(ids), v.c.review_status == "pending"
            )
        ).all()
    }
    stand_in_id = _stand_in_id(actor)
    manages = actor.administers or (actor.membership_id is not None and actor.membership_id == stand_in_id)
    views = []
    for row in rows:
        ballot = mine.get(row.id)
        veto = vetoes.get(row.id) if row.status == "in_review" else None
        can_review = veto is not None and may_review(actor, row, veto.membership_id, stand_in_id)
        views.append(
            CaseView(
                row=row,
                duty_title=service.duty_title(actor.competition, row.duty_type, row.round_number),
                responded_count=responded.get(row.id, 0),
                is_voter=ballot is not None,
                my_response=ballot.choice if ballot is not None else None,
                my_veto_reason=ballot.veto_reason if ballot is not None else None,
                can_respond=ballot is not None and row.status == "open" and ballot.choice != "veto",
                can_review=can_review,
                veto_reason=veto.veto_reason if can_review else None,
                needs_reviewer=(
                    manages
                    and veto is not None
                    and needs_reviewer(row, veto.membership_id, actor.captain_membership_id, stand_in_id)
                ),
            )
        )
    return views


# The stand-in reviewer ------------------------------------------------------------------------


def stand_in(actor: Actor) -> Any | None:
    """The league's stand-in reviewer (`id`, `display_name`), or None."""
    lg, m = t.leagues, t.league_memberships
    return actor.connection.execute(
        select(m.c.id, m.c.display_name)
        .select_from(lg.join(m, m.c.id == lg.c.stand_in_reviewer_membership_id))
        .where(lg.c.id == actor.league_id)
    ).first()


def set_stand_in(actor: Actor, member_id: UUID | None) -> None:
    """The captain or admin names the member who reviews vetoes when the captain is
    involved, or clears it. An active, claimed member other than the captain."""
    lg = t.leagues
    league = actor.connection.execute(select(lg).where(lg.c.id == actor.league_id).with_for_update()).one()
    if member_id is not None:
        row = service._league_membership(actor, member_id)
        if row.status != "active":
            raise service.problem(404, "unknown_member", "Unknown member.")
        if member_id == league.captain_membership_id:
            raise service.problem(409, "captain_cannot_stand_in", "The captain cannot be the stand-in reviewer.")
        if row.user_id is None:
            raise service.problem(409, "not_claimed", "Only a member who has claimed their name can review.")
    before = league.stand_in_reviewer_membership_id
    if before == member_id:
        return
    actor.connection.execute(
        update(lg)
        .where(lg.c.id == actor.league_id, lg.c.version == league.version)
        .values(stand_in_reviewer_membership_id=member_id, updated_at=func.now(), version=lg.c.version + 1)
    )
    service.record(
        actor,
        action="league.stand_in_reviewer_set",
        entity_type="league",
        entity_id=actor.league_id,
        before={"standInReviewerMembershipId": str(before) if before else None},
        after={"standInReviewerMembershipId": str(member_id) if member_id else None},
    )


def clear_stand_in(actor: Actor, membership_id: UUID) -> None:
    """A withdrawn member, or a name whose claim was released, stops being the stand-in
    reviewer."""
    lg = t.leagues
    actor.connection.execute(
        update(lg)
        .where(lg.c.id == actor.league_id, lg.c.stand_in_reviewer_membership_id == membership_id)
        .values(stand_in_reviewer_membership_id=None, updated_at=func.now(), version=lg.c.version + 1)
    )
