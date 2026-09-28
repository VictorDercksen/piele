"""League endpoints under /v1/leagues/{leagueId}. Handlers validate input and delegate to
app.league.service. Every route resolves the caller in the path league (`actor_dependency`)
or requires its captain or the admin (`steward_dependency`)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.competitions import Competition
from app.config import Settings
from app.league import cases, service
from app.league.context import Actor, actor_dependency, steward_dependency
from app.league.storage import Storage

router = APIRouter(prefix="/leagues/{leagueId}", tags=["league"])

DutyType = Literal["spoon", "pick_confirmation"]
# Enough to catch typos; the address is only ever compared with a verified sign-in email.
Email = Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=320)]
Lifecycle = Literal["pending_deadline", "open", "completed", "voided"]
Display = Literal["pending_deadline", "open", "overdue", "under_review", "completed", "voided"]
# Evidence cases (app/league/cases.py).
CaseStatus = Literal["open", "in_review", "accepted", "rejected", "superseded"]
CaseResolution = Literal["majority", "auto", "no_voters", "veto_upheld", "captain"]
CaseChoice = Literal["accept", "veto"]


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


def emblem_fields(request: Request, emblem_path: str | None) -> dict[str, str | None]:
    """`emblemPreset` (a preset key) and `emblemUrl` (a signed URL, uploads only) for a
    league. Both null means no emblem: the web shows the default crest or a monogram."""
    return {
        "emblemPreset": service.emblem_preset(emblem_path),
        "emblemUrl": service.emblem_url(
            storage_of(request), emblem_path, settings_of(request).league_emblem_url_ttl_seconds
        ),
    }


# Superbru rules ------------------------------------------------------------------------


class WinPoints(BaseModel):
    regular: float
    quarterFinal: float
    semiFinal: float
    final: float


class Rules(BaseModel):
    """The active season's Superbru rules (service.DEFAULT_RULES with the season's changes)."""

    # A missed pick may be recorded as a Superbru default: win points only, no grand slam.
    defaultPicks: bool
    # Informational (Superbru's own setting); the app hides the pool's picks from a member
    # without a pick until kickoff whatever this says.
    picksHiddenBeforeKickoff: bool
    bonusPoint: bool
    # False: every tied qualifier gets the full bonus point.
    bonusPointSplit: bool
    # Only picks within bonusRange of the actual margin qualify.
    bonusPointRangeCapped: bool
    # Rounds before it are not scored.
    startingRound: int
    winPoints: WinPoints
    marginPoint: float
    marginWindow: float
    bonusPointValue: float
    bonusPointMinimumShare: float
    bonusRange: float
    # Regular rounds only.
    grandSlamPoints: float
    # A membership of this league, shown with a crown.
    previousChampionMemberId: UUID | None


RuleNumber = Annotated[float, Field(ge=0, le=service.MAX_RULE_NUMBER, allow_inf_nan=False)]


class WinPointsChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    regular: RuleNumber | None = None
    quarterFinal: RuleNumber | None = None
    semiFinal: RuleNumber | None = None
    final: RuleNumber | None = None


class RulesChange(BaseModel):
    """Any subset of the rules; winPoints may be partial. Only the fields sent change;
    previousChampionMemberId null clears the champion. The service checks the rest (422
    `invalid_rules`, 404 `unknown_member` for a champion outside the league)."""

    model_config = ConfigDict(extra="forbid")

    defaultPicks: bool | None = None
    picksHiddenBeforeKickoff: bool | None = None
    bonusPoint: bool | None = None
    bonusPointSplit: bool | None = None
    bonusPointRangeCapped: bool | None = None
    startingRound: int | None = Field(default=None, ge=1)
    winPoints: WinPointsChange | None = None
    marginPoint: RuleNumber | None = None
    marginWindow: RuleNumber | None = None
    bonusPointValue: RuleNumber | None = None
    bonusPointMinimumShare: RuleNumber | None = None
    bonusRange: RuleNumber | None = None
    grandSlamPoints: RuleNumber | None = None
    previousChampionMemberId: UUID | None = None

    def change(self) -> dict[str, Any]:
        """The fields sent, as the service takes them (a null other than the champion is
        refused there)."""
        return self.model_dump(mode="json", exclude_unset=True)


class Me(BaseModel):
    """The caller in one league. The admin viewing a league they do not belong to gets
    memberId null, displayName "Admin" and isCaptain false."""

    leagueId: UUID
    slug: str
    leagueName: str
    timezone: str
    # A preset key (assets/images/emblems/<key>.svg in the web) or a short-lived signed URL
    # for an uploaded emblem; both null means no emblem.
    emblemPreset: str | None
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
    # Only for the captain and the admin (null for everyone else); null with administers
    # true means joining by code is closed. The web links to /join/<code>.
    joinCode: str | None
    # The caller's own profile: the team in this league, the account-wide photo.
    # photoUrl is short-lived; download it straight away.
    favouriteTeamId: str | None
    photoUrl: str | None
    # What the member has read in this league's notifications panel: a high-water mark and
    # the keys of items read individually above it.
    notificationsReadAt: datetime | None
    notificationsReadKeys: list[str]
    # The active season's Superbru rules.
    rules: Rules


def me_document(request: Request, actor: Actor) -> Me:
    profile = service.profile(actor, storage_of(request), settings_of(request).profile_photo_url_ttl_seconds)
    read = service.notifications_read(actor)
    return Me(
        leagueId=actor.league_id,
        slug=actor.league_slug,
        leagueName=actor.league_name,
        timezone=actor.league_timezone,
        **emblem_fields(request, actor.league_emblem_path),
        accentColour=actor.league_accent_colour,
        competition=competition_ref(actor.competition),
        seasonName=actor.season_name,
        inSeason=actor.season_membership_id is not None,
        memberId=actor.membership_id,
        displayName=actor.display_name,
        isCaptain=actor.is_captain,
        isAdmin=actor.is_admin,
        administers=actor.administers,
        joinCode=actor.league_join_code if actor.administers else None,
        favouriteTeamId=profile.favourite_team_id,
        photoUrl=profile.photo_url,
        notificationsReadAt=read.read_at,
        notificationsReadKeys=read.read_keys,
        rules=Rules.model_validate(service.rules(actor)),
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
    # "active", or "withdrawn" (only with ?include=withdrawn for the captain and the admin).
    status: str
    claimed: bool
    inSeason: bool
    # Only returned to the captain and the admin.
    email: str | None = None
    # When and why the member was removed; null for active members.
    leftAt: datetime | None = None
    withdrawalReason: str | None = None


@router.get("/members", response_model=list[Member])
def list_members(
    include: Literal["withdrawn"] | None = Query(default=None),
    actor: Actor = Depends(actor_dependency),
) -> list[Member]:
    """The team sheet. `?include=withdrawn` adds removed members for the captain and the
    admin; everyone else gets active members whatever they ask for."""
    include_withdrawn = include == "withdrawn" and actor.administers
    return [
        Member(
            id=row.id,
            displayName=row.display_name,
            fullName=row.full_name,
            status=row.status,
            claimed=row.user_id is not None,
            inSeason=row.season_membership_id is not None,
            email=row.invited_email if actor.administers else None,
            leftAt=row.left_at,
            withdrawalReason=row.withdrawal_reason,
        )
        for row in service.members(actor, include_withdrawn=include_withdrawn)
    ]


class Withdrawal(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def _strip(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


@router.post("/members/{member_id}/withdraw", status_code=204)
def withdraw_member(member_id: UUID, body: Withdrawal, actor: Actor = Depends(steward_dependency)) -> None:
    """Removes a member: off the team sheet and standings, open duties voided, records kept.
    An unclaimed name with no records is deleted instead."""
    service.withdraw_member(actor, member_id, reason=body.reason)


@router.post("/members/{member_id}/reinstate", status_code=204)
def reinstate_member(member_id: UUID, actor: Actor = Depends(steward_dependency)) -> None:
    """Brings a removed member back and enrols them in the active season again."""
    service.reinstate_member(actor, member_id)


# Emblem, accent colour and join code ----------------------------------------------------


class EmblemUploadRequest(BaseModel):
    contentType: str = Field(min_length=1, max_length=100)
    sizeBytes: int = Field(gt=0)


class EmblemUploadGrant(BaseModel):
    bucket: str
    path: str
    token: str


@router.post("/emblem/uploads", response_model=EmblemUploadGrant, status_code=201)
def reserve_emblem_upload(body: EmblemUploadRequest, request: Request, actor: Actor = Depends(steward_dependency)) -> Any:
    """A signed upload to emblems/<league id>/ in the private bucket; save it with
    PUT /appearance once the upload finishes."""
    return service.reserve_emblem_upload(
        actor,
        storage_of(request),
        content_type=body.contentType,
        size_bytes=body.sizeBytes,
        max_bytes=settings_of(request).league_emblem_max_bytes,
    )


class Appearance(BaseModel):
    """Every field is optional; a field left out is untouched and null clears it.
    emblemPreset and emblemPath cannot both be sent."""

    emblemPreset: str | None = Field(default=None, max_length=40)
    # A path from /emblem/uploads after the upload finished.
    emblemPath: str | None = Field(default=None, max_length=300)
    # "#rrggbb".
    accentColour: str | None = Field(default=None, max_length=7)


@router.put("/appearance", response_model=Me)
def update_appearance(body: Appearance, request: Request, actor: Actor = Depends(steward_dependency)) -> Me:
    """Sets the league's emblem (a preset or an upload) and accent colour."""
    sent = body.model_fields_set
    changes = {
        name: getattr(body, field)
        for field, name in (("emblemPreset", "emblem_preset_key"), ("emblemPath", "emblem_path"), ("accentColour", "accent_colour"))
        if field in sent
    }
    service.update_appearance(actor, storage_of(request), max_bytes=settings_of(request).league_emblem_max_bytes, **changes)
    return me_document(request, actor)


class JoinCode(BaseModel):
    joinCode: str


@router.post("/join-code/rotate", response_model=JoinCode)
def rotate_join_code(actor: Actor = Depends(steward_dependency)) -> JoinCode:
    """A new join code; the old one stops working. Also reopens joining after a close."""
    return JoinCode(joinCode=service.rotate_join_code(actor))


@router.delete("/join-code", status_code=204)
def close_join_code(actor: Actor = Depends(steward_dependency)) -> None:
    """Closes the league to joining by code."""
    service.close_join_code(actor)


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


class EvidenceCaseSummary(BaseModel):
    """The evidence's case, for the duty card. resolution and resolvedAt are set once it is
    accepted or rejected (resolvedAt also once superseded)."""

    id: UUID
    status: CaseStatus
    resolution: CaseResolution | None
    closesAt: datetime
    resolvedAt: datetime | None


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
    # Null for evidence submitted before cases existed and decided then.
    evidenceCase: EvidenceCaseSummary | None


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
    # The fixtures whose picks this duty covers (pick confirmation duties), in schedule order.
    pickFixtureIds: list[str]


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
                evidenceCase=(
                    EvidenceCaseSummary(
                        id=link.case_id,
                        status=link.case_status,
                        resolution=link.case_resolution,
                        closesAt=link.case_closes_at,
                        resolvedAt=link.case_resolved_at,
                    )
                    if link.case_id is not None
                    else None
                ),
            )
            for link in view.links
        ],
        pickFixtureIds=view.pick_fixture_ids,
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
    # A pick confirmation duty only: links the member's picks of these fixtures to the duty,
    # recording a `missed` pick where the member has none.
    pickFixtureIds: list[Annotated[str, Field(min_length=1, max_length=40)]] | None = Field(default=None, max_length=100)


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
        pick_fixture_ids=body.pickFixtureIds,
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
    points: Decimal = Field(ge=0, le=Decimal("99999.99"), decimal_places=2)


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


@router.delete("/rounds/{round_number}/standings/{member_id}", status_code=204)
def clear_standing(
    member_id: UUID,
    round_number: int = Path(ge=1),
    actor: Actor = Depends(steward_dependency),
) -> None:
    """Clears one member's stored round total (an override of the derived total)."""
    actor.competition.validate_round(round_number)
    service.clear_standing(actor, round_number, member_id)


@router.get("/rules", response_model=Rules)
def get_rules(actor: Actor = Depends(actor_dependency)) -> Any:
    return service.rules(actor)


@router.put("/rules", response_model=Rules)
def update_rules(body: RulesChange, actor: Actor = Depends(steward_dependency)) -> Any:
    """Captain or admin changes any subset of the season's Superbru rules."""
    return service.update_rules(actor, body.change())


# Superbru picks -----------------------------------------------------------------------

PickSide = Literal["home", "away", "draw", "missed"]
FixtureId = Annotated[str, Path(min_length=1, max_length=40)]


class Pick(BaseModel):
    memberId: UUID
    memberName: str
    side: PickSide
    # From the winner's side: 1 to 150 for home or away, 0 for a draw, null when missed.
    margin: int | None
    # A Superbru default pick: win points only.
    isDefault: bool
    # The pick confirmation duty that covers this pick.
    dutyId: UUID | None


class FixtureResult(BaseModel):
    homeScore: int
    awayScore: int
    # Postponed and cancelled fixtures are never scored (their scores are 0 when unknown).
    state: Literal["live", "half_time", "full_time", "postponed", "cancelled"]


class FixturePicks(BaseModel):
    fixtureId: str
    roundNumber: int
    kickoffUtc: datetime | None
    # Kicked off by the schedule: members can no longer change their own picks.
    locked: bool
    result: FixtureResult | None
    myPick: Pick | None
    # Empty for a member without a pick until kickoff; everyone's picks otherwise.
    picks: list[Pick]


@router.get("/picks", response_model=list[FixturePicks])
def list_picks(round: int | None = Query(default=None, ge=1), actor: Actor = Depends(actor_dependency)) -> list[Any]:
    """Every fixture from the rules' starting round on whose kickoff is known, with its result
    and picks."""
    if round is not None:
        actor.competition.validate_round(round)
    return service.picks(actor, round)


class NewPick(BaseModel):
    side: PickSide
    # Checked by the service (422 `invalid_pick`): 1 to 150 for home or away, 0 or null for a draw.
    margin: int | None = None


@router.put("/matches/{fixture_id}/picks/me", response_model=FixturePicks)
def save_own_pick(fixture_id: FixtureId, body: NewPick, actor: Actor = Depends(actor_dependency)) -> Any:
    """The caller's own pick, until kickoff (422 `picks_locked` after)."""
    service.save_own_pick(actor, fixture_id, side=body.side, margin=body.margin)
    return service.fixture_picks(actor, fixture_id)


class StewardPick(BaseModel):
    memberId: UUID
    side: PickSide
    margin: int | None = None
    isDefault: bool = False
    # Left out: an existing pick keeps its duty; null unlinks it.
    dutyId: UUID | None = None


class FixturePicksUpdate(BaseModel):
    picks: list[StewardPick] = Field(max_length=200)


@router.put("/matches/{fixture_id}/picks", response_model=FixturePicks)
def record_picks(fixture_id: FixtureId, body: FixturePicksUpdate, actor: Actor = Depends(steward_dependency)) -> Any:
    """Captain or admin records or corrects members' picks at any time; members left out keep
    theirs."""
    service.record_picks(
        actor,
        fixture_id,
        [
            service.StewardPick(
                member_id=entry.memberId,
                side=entry.side,
                margin=entry.margin,
                is_default=entry.isDefault,
                **({"duty_id": entry.dutyId} if "dutyId" in entry.model_fields_set else {}),
            )
            for entry in body.picks
        ],
    )
    return service.fixture_picks(actor, fixture_id)


@router.delete("/matches/{fixture_id}/picks/{member_id}", status_code=204)
def delete_pick(fixture_id: FixtureId, member_id: UUID, actor: Actor = Depends(steward_dependency)) -> None:
    """Captain or admin removes a member's pick."""
    service.delete_pick(actor, fixture_id, member_id)


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
    """The captain's (or admin's) override: decides the evidence at any time and closes its
    case with resolution `captain`. 403 `self_review` for the captain's own evidence."""
    service.decide_link(actor, link_id, decision=body.decision, reason=body.reason.strip())


class EvidenceCase(BaseModel):
    """One piece of evidence under the league's vote. Nothing here says who voted how:
    members see participation (respondedCount of eligibleCount), their own response, and
    once closed the outcome (status) and how it came about (resolution)."""

    id: UUID
    dutyId: UUID
    linkId: UUID
    submissionId: UUID
    # For GET /evidence/assets/{assetId}/playback.
    assetId: UUID
    roundNumber: int | None
    dutyType: DutyType
    dutyTitle: str
    subjectId: UUID
    subjectName: str
    submitterName: str
    submittedAt: datetime
    note: str
    openedAt: datetime
    # Voting ends then; a case still open at that time is accepted, dated closesAt. A
    # dismissed veto reopens voting until the same time.
    closesAt: datetime
    status: CaseStatus
    resolution: CaseResolution | None
    resolvedAt: datetime | None
    # Frozen when the case opened: active members with a claimed name other than the duty's
    # member and the submitter (less any released since without voting). A majority is
    # more than half of eligibleCount.
    eligibleCount: int
    respondedCount: int
    # The caller's ballot: in the electorate, their response and their own veto's reason,
    # and whether they may respond now (accept, or change an accept to a veto).
    isVoter: bool
    myResponse: CaseChoice | None
    myVetoReason: str | None
    canRespond: bool
    # Whether the caller may rule on the pending veto; only then is its reason given.
    canReview: bool
    vetoReason: str | None
    # A veto is waiting and no member may rule on it (the captain is involved and there is
    # no uninvolved stand-in). Only ever true for the admin without a membership, who may
    # rule on it, and for the captain on their own duty with no stand-in named; false for
    # everyone else, so it never says who vetoed.
    needsReviewer: bool
    # Changes whenever the case does; a review sends the version it was based on.
    version: int


def _case(view: cases.CaseView) -> EvidenceCase:
    row = view.row
    return EvidenceCase(
        id=row.id,
        dutyId=row.duty_id,
        linkId=row.link_id,
        submissionId=row.submission_id,
        assetId=row.asset_id,
        roundNumber=row.round_number,
        dutyType=row.duty_type,
        dutyTitle=view.duty_title,
        subjectId=row.subject_membership_id,
        subjectName=row.subject_name,
        submitterName=row.submitter_name,
        submittedAt=row.submitted_at,
        note=row.note,
        openedAt=row.opened_at,
        closesAt=row.closes_at,
        status=row.status,
        resolution=row.resolution,
        resolvedAt=row.resolved_at,
        eligibleCount=row.eligible_count,
        respondedCount=view.responded_count,
        isVoter=view.is_voter,
        myResponse=view.my_response,
        myVetoReason=view.my_veto_reason,
        canRespond=view.can_respond,
        canReview=view.can_review,
        vetoReason=view.veto_reason,
        needsReviewer=view.needs_reviewer,
        version=row.version,
    )


@router.get("/evidence/cases", response_model=list[EvidenceCase])
def list_cases(round: int | None = Query(default=None, ge=1), actor: Actor = Depends(actor_dependency)) -> list[EvidenceCase]:
    """The active season's evidence cases, newest first; one round's with `round`. Cases
    whose window has closed are settled first."""
    if round is not None:
        actor.competition.validate_round(round)
    return [_case(view) for view in cases.list_cases(actor, round_number=round)]


class CaseResponse(BaseModel):
    choice: CaseChoice
    # Required for a veto (422 `reason_required`).
    reason: str = Field(default="", max_length=500)


@router.post("/evidence/cases/{case_id}/response", response_model=EvidenceCase)
def respond_to_case(case_id: UUID, body: CaseResponse, actor: Actor = Depends(actor_dependency)) -> EvidenceCase:
    """An eligible voter accepts or vetoes while voting is open: 403 `not_a_voter`, 409
    `voting_closed`, 409 `veto_final` (a veto cannot be changed). A veto sends the case to
    review; the accept that makes a majority accepts the evidence."""
    return _case(cases.respond(actor, case_id, choice=body.choice, reason=body.reason.strip()))


class VetoReview(BaseModel):
    ruling: Literal["upheld", "dismissed"]
    reason: str = Field(min_length=1, max_length=500)
    # The EvidenceCase version the ruling is based on (409 `stale_case` if it changed).
    version: int


@router.post("/evidence/cases/{case_id}/review", response_model=EvidenceCase)
def review_case(case_id: UUID, body: VetoReview, actor: Actor = Depends(actor_dependency)) -> EvidenceCase:
    """Rules on the pending veto: 409 `stale_case` (the case changed since `version`), 409
    `not_in_review`, 403 `not_reviewer` for anyone but the uninvolved captain, the stand-in
    when the captain is involved, or the admin. Upheld rejects the evidence; dismissed
    reopens voting on the original timer."""
    return _case(cases.review(actor, case_id, ruling=body.ruling, reason=body.reason.strip(), version=body.version))


class StandInReviewer(BaseModel):
    """Reviews vetoes when the captain is involved. Both null when none is named."""

    memberId: UUID | None
    memberName: str | None


def _stand_in(actor: Actor) -> StandInReviewer:
    row = cases.stand_in(actor)
    return StandInReviewer(memberId=row.id if row else None, memberName=row.display_name if row else None)


@router.get("/stand-in-reviewer", response_model=StandInReviewer)
def get_stand_in_reviewer(actor: Actor = Depends(actor_dependency)) -> StandInReviewer:
    return _stand_in(actor)


class StandInChange(BaseModel):
    # An active, claimed member other than the captain; null clears it.
    memberId: UUID | None


@router.put("/stand-in-reviewer", response_model=StandInReviewer)
def set_stand_in_reviewer(body: StandInChange, actor: Actor = Depends(steward_dependency)) -> StandInReviewer:
    """404 `unknown_member`, 409 `captain_cannot_stand_in`, 409 `not_claimed`."""
    cases.set_stand_in(actor, body.memberId)
    return _stand_in(actor)


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
