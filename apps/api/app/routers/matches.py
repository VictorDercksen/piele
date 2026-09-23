from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from app.matchcentre.schedule import load_schedule
from app.matchcentre.service import MatchCentreService

router = APIRouter(tags=["matches"])

SectionStatus = Literal["ok", "not_published", "too_early", "past", "not_covered", "unavailable"]


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
    odds: Section
    weather: Section


def match_centre_service(request: Request) -> MatchCentreService:
    return request.app.state.match_centre


@router.get("/matches/{fixture_id}", response_model=MatchCentre)
def match_centre(fixture_id: str, request: Request) -> Any:
    fixture = load_schedule().fixture(fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Unknown fixture.")
    return match_centre_service(request).build(fixture)
