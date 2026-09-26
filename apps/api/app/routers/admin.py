"""The management centre under /v1/admin: the admin (`users.is_admin`) lists, creates,
renames, archives and restores leagues, appoints captains and adds themselves to a league.
Every route needs `admin_dependency` (else 403 `admin_only`); handlers delegate to
app.league.service, which sets each league's context before touching its rows."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, Response
from pydantic import BaseModel, Field, field_validator

from app.league import service
from app.league.context import Account, admin_dependency
from app.routers.league import CompetitionRef, Email, competition_ref, emblem_fields

router = APIRouter(prefix="/admin", tags=["admin"])


def _stripped(value: str | None) -> str | None:
    if value is None:
        return None
    if not value.strip():
        raise ValueError("must not be blank")
    return value.strip()


class AdminSeason(BaseModel):
    id: UUID
    name: str
    status: str


class AdminCaptain(BaseModel):
    memberId: UUID
    displayName: str
    claimed: bool


class AdminCounts(BaseModel):
    # Active memberships, those claimed by an account, those enrolled in the active season,
    # and withdrawn memberships.
    members: int
    claimed: int
    inSeason: int
    withdrawn: int


class AdminLeague(BaseModel):
    id: UUID
    slug: str
    name: str
    timezone: str
    # "active" or "archived".
    status: str
    emblemPreset: str | None
    emblemUrl: str | None
    accentColour: str | None
    # Null when joining by code is closed.
    joinCode: str | None
    competition: CompetitionRef
    # The active season; null when the league has none.
    season: AdminSeason | None
    captain: AdminCaptain | None
    counts: AdminCounts
    # The admin's own active membership in the league, if any.
    myMemberId: UUID | None
    createdAt: datetime


def _admin_league(request: Request, view: service.AdminLeagueView) -> AdminLeague:
    league, season, captain = view.league, view.season, view.captain
    competition = (
        competition_ref(view.competition)
        if view.competition is not None
        else CompetitionRef(id=view.competition_id, name=view.competition_id, shortName=view.competition_id)
    )
    return AdminLeague(
        id=league.id,
        slug=league.slug,
        name=league.name,
        timezone=league.timezone,
        status=league.status,
        **emblem_fields(request, league.emblem_path),
        accentColour=league.accent_colour,
        joinCode=league.join_code,
        competition=competition,
        season=AdminSeason(id=season.id, name=season.name, status=season.status) if season is not None else None,
        captain=(
            AdminCaptain(memberId=captain.id, displayName=captain.display_name, claimed=captain.user_id is not None)
            if captain is not None
            else None
        ),
        counts=AdminCounts(
            members=view.counts.members,
            claimed=view.counts.claimed,
            inSeason=view.counts.in_season,
            withdrawn=view.counts.withdrawn,
        ),
        myMemberId=view.my_member_id,
        createdAt=league.created_at,
    )


@router.get("/leagues", response_model=list[AdminLeague])
def list_leagues(request: Request, account: Account = Depends(admin_dependency)) -> list[AdminLeague]:
    """Every league, archived included: active first, then by name."""
    return [_admin_league(request, view) for view in service.admin_leagues(account)]


class NewLeagueMember(BaseModel):
    fullName: str = Field(min_length=1, max_length=120)
    displayName: str = Field(min_length=1, max_length=50)

    @field_validator("fullName", "displayName")
    @classmethod
    def _strip(cls, value: str) -> str | None:
        return _stripped(value)


class NewLeague(BaseModel):
    """The slug, competition, time zone, members, captain, emblem and colour are checked by
    `service.create_league`, whose codes pass through."""

    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=64)
    # Defaults to the competition's time zone.
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    competitionId: str = Field(min_length=1, max_length=40)
    seasonName: str = Field(min_length=1, max_length=80)
    members: list[NewLeagueMember] = Field(max_length=200)
    captainDisplayName: str = Field(min_length=1, max_length=50)
    # Null makes the admin the captain (reserved for the admin's verified email and claimed now).
    captainEmail: Email | None
    emblemPreset: str | None = Field(default=None, max_length=40)
    accentColour: str | None = Field(default=None, max_length=7)
    # With another captain: also add the admin as a member outside the season.
    addMe: bool = False

    @field_validator("name", "seasonName", "captainDisplayName")
    @classmethod
    def _strip(cls, value: str) -> str | None:
        return _stripped(value)


@router.post("/leagues", response_model=AdminLeague, status_code=201)
def create_league(body: NewLeague, request: Request, account: Account = Depends(admin_dependency)) -> AdminLeague:
    league_id = service.create_admin_league(
        account,
        name=body.name,
        slug=body.slug,
        timezone=body.timezone,
        competition_id=body.competitionId,
        season_name=body.seasonName,
        members=[{"fullName": member.fullName, "displayName": member.displayName} for member in body.members],
        captain_display_name=body.captainDisplayName,
        captain_email=body.captainEmail,
        emblem_preset_key=body.emblemPreset,
        accent_colour=body.accentColour,
        add_me=body.addMe,
    )
    return _admin_league(request, service.admin_league(account, league_id))


class LeagueUpdate(BaseModel):
    """Fields left out (or null) are untouched."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    status: Literal["active", "archived"] | None = None

    @field_validator("name", "timezone")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return _stripped(value)


@router.patch("/leagues/{leagueId}", response_model=AdminLeague)
def update_league(
    body: LeagueUpdate,
    request: Request,
    league_id: UUID = Path(alias="leagueId"),
    account: Account = Depends(admin_dependency),
) -> AdminLeague:
    """Renames the league, changes its time zone, or archives or restores it."""
    service.update_admin_league(account, league_id, name=body.name, timezone=body.timezone, status=body.status)
    return _admin_league(request, service.admin_league(account, league_id))


class CaptainAppointment(BaseModel):
    membershipId: UUID


@router.post("/leagues/{leagueId}/captain", response_model=AdminLeague)
def appoint_captain(
    body: CaptainAppointment,
    request: Request,
    league_id: UUID = Path(alias="leagueId"),
    account: Account = Depends(admin_dependency),
) -> AdminLeague:
    """Makes an active, claimed member the captain."""
    service.appoint_captain(account, league_id, body.membershipId)
    return _admin_league(request, service.admin_league(account, league_id))


class AdminMembership(BaseModel):
    # Defaults to the admin's name in another league, else "Admin".
    displayName: str | None = Field(default=None, min_length=1, max_length=50)
    # Defaults to the display name.
    fullName: str | None = Field(default=None, min_length=1, max_length=120)

    @field_validator("displayName", "fullName")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return _stripped(value)


class AdminMember(BaseModel):
    memberId: UUID


@router.post("/leagues/{leagueId}/members/me", response_model=AdminMember, status_code=201)
def add_me(
    response: Response,
    league_id: UUID = Path(alias="leagueId"),
    body: AdminMembership | None = None,
    account: Account = Depends(admin_dependency),
) -> AdminMember:
    """Adds the admin as a member outside the season: 201 when new, 200 when the admin was
    already a member (a withdrawn membership is reinstated, still out of season)."""
    body = body or AdminMembership()
    member_id, created = service.add_admin_membership(
        account, league_id, display_name=body.displayName, full_name=body.fullName
    )
    if not created:
        response.status_code = 200
    return AdminMember(memberId=member_id)
