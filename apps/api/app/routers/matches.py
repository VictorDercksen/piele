from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from app.matchcentre.schedule import load_schedule
from app.matchcentre.service import MatchCentreService

router = APIRouter(tags=["matches"])

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


def match_centre_service(request: Request) -> MatchCentreService:
    return request.app.state.match_centre


@router.get("/matches/{fixture_id}", response_model=MatchCentre)
def match_centre(fixture_id: str, request: Request) -> Any:
    fixture = load_schedule().fixture(fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Unknown fixture.")
    return match_centre_service(request).build(fixture)


@router.get("/rounds/{round_number}/scores", response_model=RoundScores)
def round_scores(round_number: int, request: Request) -> Any:
    if not load_schedule().round(round_number):
        raise HTTPException(status_code=404, detail="Unknown round.")
    return match_centre_service(request).round_scores(round_number)
