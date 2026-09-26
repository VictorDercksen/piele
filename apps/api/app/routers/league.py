"""League endpoints under /v1/leagues/{leagueId}. Handlers validate input and delegate to
app.league.service. Every route resolves the caller in the path league (`actor_dependency`)
or requires its captain or the admin (`steward_dependency`)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel, Field, field_validator

from app.competitions import Competition
from app.config import Settings
from app.league import service
from app.league.context import Actor, actor_dependency, steward_dependency
from app.league.storage import Storage

router = APIRouter(prefix="/leagues/{leagueId}", tags=["league"])

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


class CompetitionRef(BaseModel):
    id: str
    name: str
    shortName: str


def competition_ref(competition: Competition) -> CompetitionRef:
    return CompetitionRef(id=competition.id, name=competition.name, shortName=competition.short_name)


def emblem_url(emblem_path: str | None) -> str | None:
    """Phase 2 serves no emblems yet; the web falls back to the crest or a monogram."""
    return None


class Me(BaseModel):
    """The caller in one league. The admin viewing a league they do not belong to gets
    memberId null, displayName "Admin" and isCaptain false."""

    leagueId: UUID
    slug: str
    leagueName: str
    timezone: str
    emblemUrl: str | None
    accentColour: str | None
    competition: CompetitionRef
    seasonName: str
    inSeason: bool
    memberId: UUID | None
    displayName: str
    isCaptain: bool
    isAdmin: bool
    administers: bool
    # The caller's own profile: the team in this league, the account-wide photo.
    # photoUrl is short-lived; download it straight away.
    favouriteTeamId: str | None
    photoUrl: str | None
    # What the member has read in this league's notifications panel: a high-water mark and
    # the keys of items read individually above it.
    notificationsReadAt: datetime | None
    notificationsReadKeys: list[str]


def me_document(request: Request, actor: Actor) -> Me:
    profile = service.profile(actor, storage_of(request), settings_of(request).profile_photo_url_ttl_seconds)
    read = service.notifications_read(actor)
    return Me(
        leagueId=actor.league_id,
        slug=actor.league_slug,
        leagueName=actor.league_name,
        timezone=actor.league_timezone,
        emblemUrl=emblem_url(actor.league_emblem_path),
        accentColour=actor.league_accent_colour,
        competition=competition_ref(actor.competition),
        seasonName=actor.season_name,
        inSeason=actor.season_membership_id is not None,
        memberId=actor.membership_id,
        displayName=actor.display_name,
        isCaptain=actor.is_captain,
        isAdmin=actor.is_admin,
        administers=actor.administers,
        favouriteTeamId=profile.favourite_team_id,
        photoUrl=profile.photo_url,
        notificationsReadAt=read.read_at,
        notificationsReadKeys=read.read_keys,
    )


@router.get("/me", response_model=Me)
def me(request: Request, actor: Actor = Depends(actor_dependency)) -> Me:
    return me_document(request, actor)


@router.put("/me/last", status_code=204)
def record_last_league(actor: Actor = Depends(actor_dependency)) -> None:
    """Remembers this league as the one the account opened last."""
    service.record_last_league(actor)


class NotificationsRead(BaseModel):
    readAt: datetime | None
    readKeys: list[Annotated[str, Field(max_length=service.MAX_READ_KEY_LENGTH)]] = Field(
        max_length=service.MAX_READ_KEYS
    )


@router.put("/me/notifications", response_model=NotificationsRead)
def update_notifications(body: NotificationsRead, actor: Actor = Depends(actor_dependency)) -> NotificationsRead:
    """Saves what the caller has read in this league's notifications panel and returns the
    merged state."""
    read = service.update_notifications_read(actor, read_at=body.readAt, read_keys=body.readKeys)
    return NotificationsRead(readAt=read.read_at, readKeys=read.read_keys)


class PhotoUploadRequest(BaseModel):
    contentType: str = Field(min_length=1, max_length=100)
    sizeBytes: int = Field(gt=0)


class PhotoUploadGrant(BaseModel):
    bucket: str
    path: str
    token: str


@router.post("/me/photo/uploads", response_model=PhotoUploadGrant, status_code=201)
def reserve_photo_upload(body: PhotoUploadRequest, request: Request, actor: Actor = Depends(actor_dependency)) -> Any:
    """The photo is account-wide (avatars/<user id>/); the route sits under the league so
    the client has one base URL."""
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
    """Saves the caller's favourite team in this league and their photo. Nobody can change
    another member's profile."""
    service.update_profile(
        actor,
        storage_of(request),
        favourite_team_id=body.favouriteTeamId,
        photo_path=body.photoPath,
        remove_photo=body.removePhoto,
        max_bytes=settings_of(request).profile_photo_max_bytes,
    )
    return me_document(request, actor)


@router.post("/members/{member_id}/release", status_code=204)
def release_member(member_id: UUID, actor: Actor = Depends(steward_dependency)) -> None:
    service.release_membership(actor, member_id)


class Member(BaseModel):
    id: UUID
    displayName: str
    fullName: str
    status: str
    claimed: bool
    inSeason: bool
    # Only returned to the captain and the admin.
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
            email=row.invited_email if actor.administers else None,
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
def add_member(body: NewMember, actor: Actor = Depends(steward_dependency)) -> Created:
    return Created(id=service.add_member(actor, display_name=body.displayName, full_name=body.fullName, email=body.email))


@router.patch("/members/{member_id}", status_code=204)
def update_member(member_id: UUID, body: MemberUpdate, actor: Actor = Depends(steward_dependency)) -> None:
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


def _duty(competition: Competition, view: service.DutyView) -> Duty:
    row = view.row
    return Duty(
        id=row.id,
        memberId=view.member_id,
        memberName=view.member_name,
        roundNumber=row.round_number,
        type=row.type,
        title=service.duty_title(competition, row.type, row.round_number),
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
def list_duties(round: int | None = Query(default=None, ge=1), actor: Actor = Depends(actor_dependency)) -> list[Duty]:
    if round is not None:
        actor.competition.validate_round(round)
    return [_duty(actor.competition, view) for view in service.duties(actor, round_number=round)]


class NewDuty(BaseModel):
    memberId: UUID
    type: DutyType
    # The upper bound is the competition's last round, checked in the route.
    roundNumber: int | None = Field(default=None, ge=1)
    deadlineAt: datetime | None = None
    reason: str = Field(default="", max_length=500)


@router.post("/duties", response_model=Duty, status_code=201)
def create_duty(body: NewDuty, actor: Actor = Depends(steward_dependency)) -> Duty:
    if body.roundNumber is not None:
        actor.competition.validate_round(body.roundNumber)
    duty_id = service.create_duty(
        actor,
        member_id=body.memberId,
        duty_type=body.type,
        round_number=body.roundNumber,
        deadline_at=body.deadlineAt,
        reason=body.reason.strip(),
    )
    return _duty(actor.competition, service.duties(actor, duty_id=duty_id)[0])


class DefaultDeadline(BaseModel):
    deadlineAt: datetime | None


@router.get("/duties/default-deadline", response_model=DefaultDeadline)
def duty_default_deadline(
    type: DutyType, round: int = Query(ge=1), actor: Actor = Depends(actor_dependency)
) -> DefaultDeadline:
    actor.competition.validate_round(round)
    return DefaultDeadline(deadlineAt=service.default_deadline(actor.competition, type, round))


class Reason(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


@router.post("/duties/{duty_id}/void", response_model=Duty)
def void_duty(duty_id: UUID, body: Reason, actor: Actor = Depends(steward_dependency)) -> Duty:
    service.void_duty(actor, duty_id, reason=body.reason.strip())
    return _duty(actor.competition, service.duties(actor, duty_id=duty_id)[0])


@router.post("/duties/{duty_id}/reset-clock", response_model=Duty)
def reset_duty_clock(duty_id: UUID, body: Reason, actor: Actor = Depends(steward_dependency)) -> Duty:
    """Records a challenge resolved in the member's favour: the overdue clock restarts now."""
    service.reset_clock(actor, duty_id, reason=body.reason.strip())
    return _duty(actor.competition, service.duties(actor, duty_id=duty_id)[0])


class MemberMarks(BaseModel):
    memberId: UUID
    memberName: str
    marks: int
    openDuties: int


@router.get("/marks", response_model=list[MemberMarks])
def marks(actor: Actor = Depends(actor_dependency)) -> list[Any]:
    return service.marks_totals(actor)


# Superbru standings -------------------------------------------------------------------


class Standing(BaseModel):
    roundNumber: int
    memberId: UUID
    memberName: str
    rank: int
    points: float


@router.get("/standings", response_model=list[Standing])
def list_standings(round: int | None = Query(default=None, ge=1), actor: Actor = Depends(actor_dependency)) -> list[Any]:
    """Superbru round points per member for the active season, ranked within each round."""
    if round is not None:
        actor.competition.validate_round(round)
    return service.standings(actor, round)


class StandingEntry(BaseModel):
    memberId: UUID
    points: Decimal = Field(ge=0, le=Decimal("99999.9"), decimal_places=1)


class RoundStandings(BaseModel):
    standings: list[StandingEntry] = Field(max_length=200)


@router.put("/rounds/{round_number}/standings", response_model=list[Standing])
def record_standings(
    body: RoundStandings,
    round_number: int = Path(ge=1),
    actor: Actor = Depends(steward_dependency),
) -> list[Any]:
    """Captain replaces a round's Superbru table from the pool results. Members left out lose
    their row for the round."""
    actor.competition.validate_round(round_number)
    service.record_standings(actor, round_number, [(entry.memberId, entry.points) for entry in body.standings])
    return service.standings(actor, round_number)


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
    # Captain or admin only: the member the evidence is for and when they completed the duty.
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
    round: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    actor: Actor = Depends(actor_dependency),
) -> list[FeedItem]:
    if round is not None:
        actor.competition.validate_round(round)
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
