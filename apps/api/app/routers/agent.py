"""Routes for the preview agent under /v1/agent, behind the agent token.

The agent's schedule claims the fixtures that need their preview (dispatches) and starts
one writing session per claim; each session reads its fixture's state and submits the
written preview. Every submission is validated here; the agent never touches the
database. League members read previews through /v1/matches/{fixtureId}/preview.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import Engine

from app.agent import previews
from app.agent.auth import agent_dependency
from app.agent.models import PreviewSubmission
from app.agent.state import build_state
from app.db import get_engine
from app.matchcentre.cache import now_utc
from app.matchcentre.schedule import Fixture, load_schedule
from app.matchcentre.service import MatchCentreService

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(agent_dependency)])


class StoredPreview(BaseModel):
    id: str
    fixtureId: str
    revision: int
    generatedAt: datetime


class DueFixture(BaseModel):
    fixtureId: str
    round: int
    kickoffUtc: datetime
    homeId: str
    awayId: str
    reason: str
    teamsheetHash: str
    attempt: int


class DueFixtures(BaseModel):
    generatedAt: datetime
    fixtures: list[DueFixture]


class Dispatch(DueFixture):
    dispatchedAt: datetime


class Dispatches(BaseModel):
    generatedAt: datetime
    dispatches: list[Dispatch]


def match_centre(request: Request) -> MatchCentreService:
    return request.app.state.match_centre


def engine_of(request: Request) -> Engine:
    engine = get_engine(request.app.state.settings)
    if engine is None:
        raise HTTPException(status_code=503, detail={"code": "no_database", "message": "The database is not configured."})
    return engine


def open_fixture(fixture_id: str, now: datetime) -> Fixture:
    fixture = load_schedule().fixture(fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_fixture", "message": "Unknown fixture."})
    if fixture.home_id is None or fixture.away_id is None or fixture.kickoff_utc is None:
        raise HTTPException(
            status_code=409, detail={"code": "fixture_unscheduled", "message": "Teams or kickoff are not known yet."}
        )
    if now >= fixture.kickoff_utc:
        raise HTTPException(status_code=409, detail={"code": "kicked_off", "message": "The match has kicked off."})
    return fixture


@router.get("/fixtures/due", response_model=DueFixtures)
def due(request: Request) -> Any:
    now = now_utc()
    # Provider calls first, so no database connection is held while the feeds answer.
    engine = engine_of(request)
    hashes = previews.teamsheet_hashes(load_schedule(), match_centre(request), now)
    with engine.begin() as conn:
        return {"generatedAt": now, "fixtures": previews.due_fixtures(conn, hashes, now)}


@router.post("/dispatches", response_model=Dispatches)
def dispatch(request: Request) -> Any:
    """Claim up to DISPATCH_LIMIT due fixtures, soonest kickoff first, for writing sessions."""
    now = now_utc()
    engine = engine_of(request)
    hashes = previews.teamsheet_hashes(load_schedule(), match_centre(request), now)
    with engine.begin() as conn:
        due = previews.due_fixtures(conn, hashes, now)[: previews.DISPATCH_LIMIT]
        claimed = [c for c in (previews.claim(conn, d, now) for d in due) if c is not None]
    return {"generatedAt": now, "dispatches": claimed}


@router.get("/fixtures/{fixture_id}/state")
def fixture_state(fixture_id: str, request: Request) -> dict[str, Any]:
    now = now_utc()
    return build_state(open_fixture(fixture_id, now), load_schedule(), match_centre(request), now)


@router.post("/previews", response_model=StoredPreview, status_code=201)
def save_preview(body: PreviewSubmission, request: Request, response: Response) -> Any:
    open_fixture(body.fixtureId, now_utc())
    values = {
        "fixture_id": body.fixtureId,
        "inputs_hash": body.inputsHash,
        "teamsheet_hash": body.teamsheetHash,
        "summary": body.summary,
        "key_factors": body.keyFactors.model_dump(mode="json"),
        "sentiment": body.sentiment.model_dump(mode="json"),
        "sources": [s.model_dump(mode="json") for s in body.sources],
        "models": body.models.model_dump(mode="json"),
        "usage": body.usage.model_dump(mode="json") if body.usage else None,
        "run_id": body.runId,
    }
    try:
        with engine_of(request).begin() as conn:
            row, created = previews.save(conn, values)
    except previews.PreviewConflict as exc:
        raise HTTPException(status_code=409, detail={"code": "preview_conflict", "message": str(exc)}) from exc
    if not created:
        response.status_code = 200
    return {"id": str(row.id), "fixtureId": row.fixture_id, "revision": row.revision, "generatedAt": row.generated_at}
