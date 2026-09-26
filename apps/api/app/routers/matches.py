from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from app.agent import previews
from app.agent.models import MatchPreview
from app.league.context import Actor, actor_dependency
from app.matchcentre import service as service_module
from app.matchcentre import updates
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


def match_centre_service(request: Request) -> MatchCentreService:
    return request.app.state.match_centre


@router.get("/matches/{fixture_id}", response_model=MatchCentre)
def match_centre(fixture_id: str, request: Request) -> Any:
    fixture = load_schedule().fixture(fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Unknown fixture.")
    return match_centre_service(request).build(fixture)


@router.get("/matches/{fixture_id}/preview", response_model=MatchPreview)
def match_preview(fixture_id: str, actor: Actor = Depends(actor_dependency)) -> Any:
    """The latest Pavilion preview for members. Written by the preview agent before kickoff."""
    if load_schedule().fixture(fixture_id) is None:
        raise HTTPException(status_code=404, detail="Unknown fixture.")
    row = previews.latest(actor.connection, fixture_id)
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


@router.get("/rounds/{round_number}/scores", response_model=RoundScores)
def round_scores(round_number: int, request: Request) -> Any:
    if not load_schedule().round(round_number):
        raise HTTPException(status_code=404, detail="Unknown round.")
    return match_centre_service(request).round_scores(round_number)


@router.get("/rounds/{round_number}/updates", response_model=RoundUpdates)
def round_updates(round_number: int, request: Request, actor: Actor = Depends(actor_dependency)) -> Any:
    """The round's teamsheets, previews, kick-offs and full-time results for the notifications
    panel. Members only, because it reports the Pavilion previews."""
    if not load_schedule().round(round_number):
        raise HTTPException(status_code=404, detail="Unknown round.")
    return updates.round_updates(
        actor.connection, match_centre_service(request), round_number, service_module.now_utc()
    )
