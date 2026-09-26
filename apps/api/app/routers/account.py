"""Account endpoints under /v1: the signed-in account and its leagues, and joining a league
by its code. No league context comes from the client; the join code names the league."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.league import service
from app.league.context import Account, account_dependency
from app.routers.league import CompetitionRef, Me, competition_ref, emblem_url, me_document, settings_of, storage_of

router = APIRouter(tags=["account"])


class LeagueSummary(BaseModel):
    """One league in the account's list. Member fields are null in the admin's view of a
    league they do not belong to."""

    id: UUID
    slug: str
    name: str
    timezone: str
    emblemUrl: str | None
    accentColour: str | None
    competition: CompetitionRef
    seasonName: str
    inSeason: bool
    memberId: UUID | None
    displayName: str | None
    isCaptain: bool
    favouriteTeamId: str | None


class AccountDocument(BaseModel):
    userId: UUID
    # Short-lived; download it straight away.
    photoUrl: str | None
    isAdmin: bool
    lastLeagueId: UUID | None
    leagues: list[LeagueSummary]


def _summary(summary: service.LeagueSummary) -> LeagueSummary:
    league, membership = summary.league, summary.membership
    return LeagueSummary(
        id=league.id,
        slug=league.slug,
        name=league.name,
        timezone=league.timezone,
        emblemUrl=emblem_url(league.emblem_path),
        accentColour=league.accent_colour,
        competition=competition_ref(summary.competition),
        seasonName=summary.season.name,
        inSeason=summary.in_season,
        memberId=membership.id if membership is not None else None,
        displayName=membership.display_name if membership is not None else None,
        isCaptain=membership is not None and league.captain_membership_id == membership.id,
        favouriteTeamId=membership.favourite_team_id if membership is not None else None,
    )


@router.get("/me", response_model=AccountDocument)
def account(request: Request, account: Account = Depends(account_dependency)) -> AccountDocument:
    """The account and its leagues. First claims every name reserved for the verified email."""
    leagues = service.account_leagues(account)
    return AccountDocument(
        userId=account.user_id,
        photoUrl=service.photo_url(
            account.connection, account.user_id, storage_of(request), settings_of(request).profile_photo_url_ttl_seconds
        ),
        isAdmin=account.is_admin,
        lastLeagueId=service.last_league_id(account),
        leagues=[_summary(summary) for summary in leagues],
    )


class JoinLeague(BaseModel):
    id: UUID
    slug: str
    name: str
    timezone: str
    emblemUrl: str | None
    accentColour: str | None
    competition: CompetitionRef
    seasonName: str


class UnclaimedName(BaseModel):
    id: UUID
    displayName: str
    fullName: str


class JoinInvitation(BaseModel):
    league: JoinLeague
    alreadyMember: bool
    # Names the caller may claim: unclaimed and unreserved, or reserved for their email.
    unclaimed: list[UnclaimedName]


@router.get("/join/{code}", response_model=JoinInvitation)
def join_invitation(code: str, account: Account = Depends(account_dependency)) -> JoinInvitation:
    view = service.join_view(account, code)
    league = view.summary.league
    return JoinInvitation(
        league=JoinLeague(
            id=league.id,
            slug=league.slug,
            name=league.name,
            timezone=league.timezone,
            emblemUrl=emblem_url(league.emblem_path),
            accentColour=league.accent_colour,
            competition=competition_ref(view.summary.competition),
            seasonName=view.summary.season.name,
        ),
        alreadyMember=view.already_member,
        unclaimed=[UnclaimedName(id=row.id, displayName=row.display_name, fullName=row.full_name) for row in view.unclaimed],
    )


class Claim(BaseModel):
    membershipId: UUID


@router.post("/join/{code}", response_model=Me)
def join(code: str, body: Claim, request: Request, account: Account = Depends(account_dependency)) -> Me:
    """Claims one name in the league the code opens and returns the caller's view of it."""
    actor = service.join(account, code, body.membershipId)
    return me_document(request, actor)
