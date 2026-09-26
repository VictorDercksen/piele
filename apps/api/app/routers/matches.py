from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import Engine
from pydantic import BaseModel, ConfigDict

from app import competitions
from app.agent import previews
from app.agent.models import MatchPreview
from app.dependencies import competition_centre
from app.league.auth import Claims
from app.league.context import (
    Account,
    account_dependency,
    claims_dependency,
    competition_member_dependency,
    engine_dependency,
    resolve_competition_member,
)
from app.matchcentre import service as service_module
from app.matchcentre import updates
from app.matchcentre.service import MatchCentreService

# The competition registry (/v1/competitions) and competition data under
# /v1/competitions/{competitionId}: the same for every league.
router = APIRouter(tags=["competitions"])

SectionStatus = Literal["ok", "not_published", "too_early", "past", "unavailable"]


class Section(BaseModel):
    """One provider's contribution. `status` is meaningful even when data is missing."""

    model_config = ConfigDict(extra="allow")

    status: SectionStatus
    source: str
    fetchedAt: datetime | None = None


class ClubView(BaseModel):
    id: str
    name: str
    shortName: str


class MatchCentre(BaseModel):
    fixtureId: str
    round: int
    kickoffUtc: datetime | None
    venue: str | None
    home: ClubView | None
    away: ClubView | None
    generatedAt: datetime
    teamsheets: Section
    weather: Section
    score: Section


MatchState = Literal["scheduled", "live", "half_time", "full_time", "postponed", "cancelled"]


class SideScore(BaseModel):
    score: int | None
    halfTime: int | None


class MatchScore(BaseModel):
    fixtureId: str
    state: MatchState
    period: str | None
    minute: int | None
    clockRunning: bool
    home: SideScore
    away: SideScore


class RoundScores(BaseModel):
    """Scores for every fixture in a round. `status` describes the feed, not the matches."""

    round: int
    generatedAt: datetime
    status: SectionStatus
    source: str
    fetchedAt: datetime | None = None
    reason: str | None = None
    matches: list[MatchScore]


class RoundEvent(BaseModel):
    """One competition milestone of a fixture. `occurredAt` stays put once reported."""

    kind: Literal["teamsheets_published", "preview_published", "kicked_off", "full_time"]
    fixtureId: str
    occurredAt: datetime
    revision: int | None = None
    homeScore: int | None = None
    awayScore: int | None = None


class RoundUpdates(BaseModel):
    round: int
    generatedAt: datetime
    events: list[RoundEvent]


class CompetitionSummary(BaseModel):
    id: str
    name: str
    shortName: str
    # The competition's display time zone, the default for a new league on it.
    timezone: str
    regularRounds: int
    lastRound: int


@router.get("/competitions", response_model=list[CompetitionSummary])
def list_competitions(account: Account = Depends(account_dependency)) -> list[CompetitionSummary]:
    """The competitions a league can play (the registry), for the management centre's form.
    Any signed-in account may read it."""
    return [
        CompetitionSummary(
            id=competition.id,
            name=competition.name,
            shortName=competition.short_name,
            timezone=competition.timezone,
            regularRounds=competition.regular_rounds,
            lastRound=competition.last_round,
        )
        for competition in competitions.ALL.values()
    ]


@router.get("/competitions/{competitionId}/matches/{fixture_id}", response_model=MatchCentre)
def match_centre(fixture_id: str, centre: MatchCentreService = Depends(competition_centre)) -> Any:
    fixture = centre.competition.schedule().fixture(fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Unknown fixture.")
    return centre.build(fixture)


@router.get("/competitions/{competitionId}/matches/{fixture_id}/preview", response_model=MatchPreview)
def match_preview(
    fixture_id: str,
    centre: MatchCentreService = Depends(competition_centre),
    account: Account = Depends(competition_member_dependency),
) -> Any:
    """The latest Pavilion preview for members. Written by the preview agent before kickoff."""
    competition = centre.competition
    if competition.schedule().fixture(fixture_id) is None:
        raise HTTPException(status_code=404, detail="Unknown fixture.")
    row = previews.latest(account.connection, competition.id, fixture_id)
    if row is None:
        return {"fixtureId": fixture_id, "preview": None}
    return {
        "fixtureId": fixture_id,
        "preview": {
            "revision": row.revision,
            "generatedAt": row.generated_at,
            "summary": row.summary,
            "keyFactors": row.key_factors,
            "sentiment": row.sentiment,
            "sources": row.sources,
        },
    }


@router.get("/competitions/{competitionId}/rounds/{round_number}/scores", response_model=RoundScores)
def round_scores(round_number: int, centre: MatchCentreService = Depends(competition_centre)) -> Any:
    if not centre.competition.schedule().round(round_number):
        raise HTTPException(status_code=404, detail="Unknown round.")
    return centre.round_scores(round_number)


@router.get("/competitions/{competitionId}/rounds/{round_number}/updates", response_model=RoundUpdates)
def round_updates(
    round_number: int,
    request: Request,
    centre: MatchCentreService = Depends(competition_centre),
    claims: Claims = Depends(claims_dependency),
    engine: Engine = Depends(engine_dependency),
) -> Any:
    """The round's teamsheets, previews, kick-offs and full-time results for the notifications
    panel. Members of a league on this competition (or the admin) only, because it reports
    the Pavilion previews. The member is resolved inside the handler, with the same rule as
    `competition_member_dependency`, so no transaction is open while the match centre uses
    the pool."""
    if not centre.competition.schedule().round(round_number):
        raise HTTPException(status_code=404, detail="Unknown round.")
    competition_id = centre.competition.id
    return updates.round_updates(
        engine,
        centre,
        round_number,
        service_module.now_utc(),
        lambda connection: resolve_competition_member(connection, claims, request.state.request_id, competition_id),
    )
