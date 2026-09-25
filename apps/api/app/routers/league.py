"""League endpoints under /v1. Handlers validate input and delegate to app.league.service."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, field_validator

from app.config import Settings
from app.league import service
from app.league.context import Account, Actor, account_dependency, actor_dependency, actor_for, captain_dependency
from app.league.storage import Storage

router = APIRouter(tags=["league"])

DutyType = Literal["spoon", "pick_confirmation"]
# Enough to catch typos; the address is only ever compared with a verified sign-in email.
Email = Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=320)]
Lifecycle = Literal["pending_deadline", "open", "completed", "voided"]
Display = Literal["pending_deadline", "open", "overdue", "under_review", "completed", "voided"]


def settings_of(request: Request) -> Settings:
    return request.app.state.settings


def storage_of(request: Request) -> Storage:
    return request.app.state.storage


# Me and members -----------------------------------------------------------------------


class Me(BaseModel):
    memberId: UUID
    displayName: str
    isCaptain: bool
    leagueName: str
    seasonName: str
    inSeason: bool
    # The caller's own profile. photoUrl is short-lived; download it straight away.
    favouriteTeamId: str | None
    photoUrl: str | None


@router.get("/me", response_model=Me)
def me(request: Request, actor: Actor = Depends(actor_dependency)) -> Me:
    profile = service.profile(actor, storage_of(request), settings_of(request).profile_photo_url_ttl_seconds)
    return Me(
        memberId=actor.membership_id,
        displayName=actor.display_name,
        isCaptain=actor.is_captain,
        leagueName=actor.league_name,
        seasonName=actor.season_name,
        inSeason=actor.season_membership_id is not None,
        favouriteTeamId=profile.favourite_team_id,
        photoUrl=profile.photo_url,
    )


class PhotoUploadRequest(BaseModel):
    contentType: str = Field(min_length=1, max_length=100)
    sizeBytes: int = Field(gt=0)


class PhotoUploadGrant(BaseModel):
    bucket: str
    path: str
    token: str


@router.post("/me/photo/uploads", response_model=PhotoUploadGrant, status_code=201)
def reserve_photo_upload(body: PhotoUploadRequest, request: Request, actor: Actor = Depends(actor_dependency)) -> Any:
    return service.reserve_photo_upload(
        actor,
        storage_of(request),
        content_type=body.contentType,
        size_bytes=body.sizeBytes,
        max_bytes=settings_of(request).profile_photo_max_bytes,
    )


class ProfileUpdate(BaseModel):
    favouriteTeamId: str = Field(min_length=1, max_length=40)
    # A path from /me/photo/uploads after the upload finished; omit it to keep the photo.
    photoPath: str | None = Field(default=None, max_length=300)
    removePhoto: bool = False


@router.put("/me/profile", response_model=Me)
def update_profile(body: ProfileUpdate, request: Request, actor: Actor = Depends(actor_dependency)) -> Me:
    """Saves the caller's favourite team and photo. Nobody can change another member's profile."""
    service.update_profile(
        actor,
        storage_of(request),
        favourite_team_id=body.favouriteTeamId,
        photo_path=body.photoPath,
        remove_photo=body.removePhoto,
        max_bytes=settings_of(request).profile_photo_max_bytes,
    )
    return me(request, actor)


class UnclaimedName(BaseModel):
    id: UUID
    displayName: str
    fullName: str


@router.get("/memberships/unclaimed", response_model=list[UnclaimedName])
def unclaimed(account: Account = Depends(account_dependency)) -> list[UnclaimedName]:
    return [
        UnclaimedName(id=row.id, displayName=row.display_name, fullName=row.full_name)
        for row in service.unclaimed_memberships(account.connection)
    ]


class Claim(BaseModel):
    memberId: UUID


@router.post("/memberships/claim", response_model=Me)
def claim(body: Claim, request: Request, account: Account = Depends(account_dependency)) -> Me:
    """A signed-in account without a membership takes one of the unclaimed Superbru names."""
    if not service.claim_membership(account.connection, account.user_id, body.memberId):
        raise service.problem(409, "name_taken", "That name is no longer available. Choose another.")
    actor = actor_for(account, just_claimed=True)
    return me(request, actor)


@router.post("/members/{member_id}/release", status_code=204)
def release_member(member_id: UUID, actor: Actor = Depends(captain_dependency)) -> None:
    service.release_membership(actor, member_id)


class Member(BaseModel):
    id: UUID
    displayName: str
    fullName: str
    status: str
    claimed: bool
    inSeason: bool
    # Only returned to the captain.
    email: str | None = None


@router.get("/members", response_model=list[Member])
def list_members(actor: Actor = Depends(actor_dependency)) -> list[Member]:
    return [
        Member(
            id=row.id,
            displayName=row.display_name,
            fullName=row.full_name,
            status=row.status,
            claimed=row.user_id is not None,
            inSeason=row.season_membership_id is not None,
            email=row.invited_email if actor.is_captain else None,
        )
        for row in service.members(actor)
    ]


class NewMember(BaseModel):
    displayName: str = Field(min_length=1, max_length=50)
    fullName: str = Field(min_length=1, max_length=120)
    email: Email | None = None

    @field_validator("displayName", "fullName")
    @classmethod
    def _strip(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class MemberUpdate(BaseModel):
    displayName: str | None = Field(default=None, min_length=1, max_length=50)
    email: Email | None = None
    clearEmail: bool = False


class Created(BaseModel):
    id: UUID


@router.post("/members", response_model=Created, status_code=201)
def add_member(body: NewMember, actor: Actor = Depends(captain_dependency)) -> Created:
    return Created(id=service.add_member(actor, display_name=body.displayName, full_name=body.fullName, email=body.email))


@router.patch("/members/{member_id}", status_code=204)
def update_member(member_id: UUID, body: MemberUpdate, actor: Actor = Depends(captain_dependency)) -> None:
    service.update_member(
        actor, member_id, display_name=body.displayName, email=body.email, clear_email=body.clearEmail
    )


# Duties -------------------------------------------------------------------------------


class EvidenceLink(BaseModel):
    id: UUID
    submissionId: UUID
    assetId: UUID
    decision: str
    submittedAt: datetime
    claimedCompletedAt: datetime | None
    decidedAt: datetime | None
    reason: str | None
    effectiveCompletedAt: datetime | None
    note: str
    submitterId: UUID
    submitterName: str


class Marks(BaseModel):
    marks: int
    overdueHours: float
    asOf: datetime
    nextMarkAt: datetime | None
    explanation: str


class Duty(BaseModel):
    id: UUID
    memberId: UUID
    memberName: str
    roundNumber: int | None
    type: DutyType
    title: str
    reason: str
    deadlineAt: datetime | None
    status: Lifecycle
    display: Display
    completedAt: datetime | None
    clockResetAt: datetime | None
    voidReason: str | None
    createdAt: datetime
    marks: Marks
    evidence: list[EvidenceLink]


def _duty(view: service.DutyView) -> Duty:
    row = view.row
    return Duty(
        id=row.id,
        memberId=view.member_id,
        memberName=view.member_name,
        roundNumber=row.round_number,
        type=row.type,
        title=service.duty_title(row.type, row.round_number),
        reason=row.reason,
        deadlineAt=row.deadline_at,
        status=row.status,
        display=view.display,
        completedAt=row.completed_at,
        clockResetAt=row.clock_reset_at,
        voidReason=row.void_reason,
        createdAt=row.created_at,
        marks=Marks(
            marks=view.marks.marks,
            overdueHours=round(view.marks.overdue_hours, 1),
            asOf=view.marks.as_of,
            nextMarkAt=view.marks.next_mark_at,
            explanation=view.marks.explanation,
        ),
        evidence=[
            EvidenceLink(
                id=link.id,
                submissionId=link.submission_id,
                assetId=link.asset_id,
                decision=link.decision,
                submittedAt=link.submitted_at,
                claimedCompletedAt=link.claimed_completed_at,
                decidedAt=link.decided_at,
                reason=link.reason,
                effectiveCompletedAt=link.effective_completed_at,
                note=link.note,
                submitterId=link.submitter_membership_id,
                submitterName=link.submitter_name,
            )
            for link in view.links
        ],
    )


@router.get("/duties", response_model=list[Duty])
def list_duties(
    round: int | None = Query(default=None, ge=1, le=service.LAST_ROUND), actor: Actor = Depends(actor_dependency)
) -> list[Duty]:
    return [_duty(view) for view in service.duties(actor, round_number=round)]


class NewDuty(BaseModel):
    memberId: UUID
    type: DutyType
    roundNumber: int | None = Field(default=None, ge=1, le=service.LAST_ROUND)
    deadlineAt: datetime | None = None
    reason: str = Field(default="", max_length=500)


@router.post("/duties", response_model=Duty, status_code=201)
def create_duty(body: NewDuty, actor: Actor = Depends(captain_dependency)) -> Duty:
    duty_id = service.create_duty(
        actor,
        member_id=body.memberId,
        duty_type=body.type,
        round_number=body.roundNumber,
        deadline_at=body.deadlineAt,
        reason=body.reason.strip(),
    )
    return _duty(service.duties(actor, duty_id=duty_id)[0])


class DefaultDeadline(BaseModel):
    deadlineAt: datetime | None


@router.get("/duties/default-deadline", response_model=DefaultDeadline)
def duty_default_deadline(
    type: DutyType, round: int = Query(ge=1, le=service.LAST_ROUND), actor: Actor = Depends(actor_dependency)
) -> DefaultDeadline:
    return DefaultDeadline(deadlineAt=service.default_deadline(type, round))


class Reason(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


@router.post("/duties/{duty_id}/void", response_model=Duty)
def void_duty(duty_id: UUID, body: Reason, actor: Actor = Depends(captain_dependency)) -> Duty:
    service.void_duty(actor, duty_id, reason=body.reason.strip())
    return _duty(service.duties(actor, duty_id=duty_id)[0])


@router.post("/duties/{duty_id}/reset-clock", response_model=Duty)
def reset_duty_clock(duty_id: UUID, body: Reason, actor: Actor = Depends(captain_dependency)) -> Duty:
    """Records a challenge resolved in the member's favour: the overdue clock restarts now."""
    service.reset_clock(actor, duty_id, reason=body.reason.strip())
    return _duty(service.duties(actor, duty_id=duty_id)[0])


class MemberMarks(BaseModel):
    memberId: UUID
    memberName: str
    marks: int
    openDuties: int


@router.get("/marks", response_model=list[MemberMarks])
def marks(actor: Actor = Depends(actor_dependency)) -> list[Any]:
    return service.marks_totals(actor)


# Evidence -----------------------------------------------------------------------------


class UploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    contentType: str = Field(min_length=1, max_length=100)
    sizeBytes: int = Field(gt=0)


class UploadGrant(BaseModel):
    assetId: UUID
    bucket: str
    path: str
    token: str
    expiresAt: datetime


@router.post("/evidence/uploads", response_model=UploadGrant, status_code=201)
def reserve_upload(body: UploadRequest, request: Request, actor: Actor = Depends(actor_dependency)) -> Any:
    settings = settings_of(request)
    return service.reserve_upload(
        actor,
        storage_of(request),
        filename=body.filename,
        content_type=body.contentType,
        size_bytes=body.sizeBytes,
        max_bytes=settings.evidence_max_bytes,
        ttl_seconds=settings.evidence_upload_ttl_seconds,
    )


class Submission(BaseModel):
    assetId: UUID
    dutyIds: list[UUID] = Field(min_length=1, max_length=10)
    note: str = Field(default="", max_length=500)
    # Captain only: the member the evidence is for and when they completed the duty.
    subjectMemberId: UUID | None = None
    claimedCompletedAt: datetime | None = None


@router.post("/evidence", response_model=Created, status_code=201)
def submit_evidence(body: Submission, request: Request, actor: Actor = Depends(actor_dependency)) -> Created:
    return Created(
        id=service.submit_evidence(
            actor,
            storage_of(request),
            asset_id=body.assetId,
            duty_ids=body.dutyIds,
            note=body.note.strip(),
            subject_member_id=body.subjectMemberId,
            claimed_completed_at=body.claimedCompletedAt,
            max_bytes=settings_of(request).evidence_max_bytes,
        )
    )


class Decision(BaseModel):
    decision: Literal["accepted", "rejected"]
    reason: str = Field(default="", max_length=500)


@router.post("/evidence/links/{link_id}/decision", status_code=204)
def decide(link_id: UUID, body: Decision, actor: Actor = Depends(actor_dependency)) -> None:
    service.decide_link(actor, link_id, decision=body.decision, reason=body.reason.strip())


class Playback(BaseModel):
    url: str
    expiresAt: datetime
    filename: str


@router.get("/evidence/assets/{asset_id}/playback", response_model=Playback)
def playback(asset_id: UUID, request: Request, actor: Actor = Depends(actor_dependency)) -> Any:
    return service.playback_url(actor, storage_of(request), asset_id, settings_of(request).evidence_playback_ttl_seconds)


# Feed ---------------------------------------------------------------------------------


class FeedItem(BaseModel):
    id: UUID
    kind: str
    roundNumber: int | None
    title: str
    detail: str
    occurredAt: datetime
    actorName: str | None
    subjectName: str | None
    dutyId: UUID | None


@router.get("/feed", response_model=list[FeedItem])
def feed(
    round: int | None = Query(default=None, ge=1, le=service.LAST_ROUND),
    limit: int = Query(default=50, ge=1, le=200),
    actor: Actor = Depends(actor_dependency),
) -> list[FeedItem]:
    return [
        FeedItem(
            id=row.id,
            kind=row.kind,
            roundNumber=row.round_number,
            title=row.title,
            detail=row.detail,
            occurredAt=row.occurred_at,
            actorName=row.actor_name,
            subjectName=row.subject_name,
            dutyId=row.duty_id,
        )
        for row in service.feed(actor, round, limit)
    ]
