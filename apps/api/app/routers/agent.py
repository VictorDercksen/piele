"""Routes for the preview agent under /v1/agent, behind the agent token.

The agent's schedule claims the fixtures that need their preview (dispatches) and starts
one writing session per claim; each session reads its fixture's state and submits the
written preview. Every submission is validated here; the agent never touches the
database. League members read previews through
/v1/competitions/{competitionId}/matches/{fixtureId}/preview.

Every request that names a fixture takes an optional `competitionId` (body field or query
parameter) defaulting to the URC 2026/27, and every dispatch and fixture state echoes it.
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import Engine

from app.agent import internationals, previews
from app.agent.auth import agent_dependency
from app.agent.models import DispatchRequest, PreviewSubmission
from app.agent.state import build_state
from app.competitions import DEFAULT_COMPETITION_ID
from app.db import get_engine
from app.dependencies import match_centre_for
from app.matchcentre.cache import now_utc
from app.matchcentre.schedule import Fixture
from app.matchcentre.service import MatchCentreService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(agent_dependency)])


class StoredPreview(BaseModel):
    id: str
    competitionId: str
    fixtureId: str
    revision: int
    generatedAt: datetime


class DueFixture(BaseModel):
    competitionId: str
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


def competition_query(
    request: Request, competition_id: str = Query(default=DEFAULT_COMPETITION_ID, alias="competitionId")
) -> MatchCentreService:
    """The match centre of the `competitionId` query parameter (default URC 2026/27)."""
    return match_centre_for(request, competition_id)


def engine_of(request: Request) -> Engine:
    engine = get_engine(request.app.state.settings)
    if engine is None:
        raise HTTPException(status_code=503, detail={"code": "no_database", "message": "The database is not configured."})
    return engine


def open_fixture(centre: MatchCentreService, fixture_id: str, now: datetime) -> Fixture:
    fixture = centre.competition.schedule().fixture(fixture_id)
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
def due(request: Request, centre: MatchCentreService = Depends(competition_query)) -> Any:
    now = now_utc()
    # Provider calls first, so no database connection is held while the feeds answer.
    engine = engine_of(request)
    hashes = previews.teamsheet_hashes(centre, now)
    with engine.begin() as conn:
        return {"generatedAt": now, "fixtures": previews.due_fixtures(conn, centre.competition.id, hashes, now)}


@router.post("/dispatches", response_model=Dispatches)
def dispatch(request: Request, body: DispatchRequest | None = None) -> Any:
    """Claim up to DISPATCH_LIMIT due fixtures of the competition, soonest kickoff first, for
    writing sessions.

    With a fixtureId, only that fixture is considered; with force as well, it is claimed even
    when it has a preview, is inside a lease or has used its attempts.
    """
    body = body or DispatchRequest()
    now = now_utc()
    centre = match_centre_for(request, body.competitionId)
    engine = engine_of(request)
    if body.fixtureId is not None:
        open_fixture(centre, body.fixtureId, now)
    hashes = previews.teamsheet_hashes(centre, now, body.fixtureId)
    with engine.begin() as conn:
        due = previews.due_fixtures(conn, centre.competition.id, hashes, now, body.force)[: previews.DISPATCH_LIMIT]
        claimed = [c for c in (previews.claim(conn, d, now) for d in due) if c is not None]
    return {"generatedAt": now, "dispatches": claimed}


@router.get("/fixtures/{fixture_id}/state")
def fixture_state(
    fixture_id: str, request: Request, centre: MatchCentreService = Depends(competition_query)
) -> dict[str, Any]:
    now = now_utc()
    state = build_state(open_fixture(centre, fixture_id, now), centre, now)
    # The stored internationals of each side's selected players, after the provider reads in a
    # short transaction of their own. Outside the state hash: they are notes from earlier runs,
    # not inputs of this preview.
    known = known_internationals(request, state)
    for side in ("home", "away"):
        state[side]["internationals"] = known[side]
    return state


def known_internationals(request: Request, state: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Per side, the stored records of players in the side's teamsheet. Empty without a
    teamsheet, a database or a readable table: the agent then researches them afresh."""
    club_ids = {side: (state[side].get("club") or {}).get("id") for side in ("home", "away")}
    empty: dict[str, list[dict[str, Any]]] = {"home": [], "away": []}
    if not any(state[side].get("teamsheet") for side in empty):
        return empty
    engine = get_engine(request.app.state.settings)
    if engine is None:
        return empty
    try:
        with engine.begin() as conn:
            stored = internationals.for_clubs(conn, club_ids.values())
    except Exception as exc:  # noqa: BLE001 - the state is still worth returning
        logger.warning("agent state fixture=%s internationals not read: %s", state["fixtureId"], type(exc).__name__)
        return empty
    return {
        side: internationals.state_view(internationals.matched(stored.get(club_ids[side]) or [], state[side].get("teamsheet")))
        for side in empty
    }


def matched_internationals(
    centre: MatchCentreService, fixture: Fixture, body: PreviewSubmission, now: datetime
) -> dict[str, list[dict[str, Any]]]:
    """Each side's submitted internationals whose player is in that side's current teamsheet.

    The teamsheet read is a provider call (through the snapshot cache), so it happens before
    the transaction. Without a teamsheet, or when it cannot be read, nothing is stored: the
    preview itself never fails on it.
    """
    submitted = {
        side: [i.model_dump() for i in getattr(body.research, side).internationals] if body.research else []
        for side in ("home", "away")
    }
    if not any(submitted.values()):
        return {"home": [], "away": []}
    try:
        sheets = centre.teamsheets(fixture, now)
        if sheets.get("status") != "ok":
            return {"home": [], "away": []}
        return {side: [dict(r) for r in internationals.matched(submitted[side], sheets.get(side))] for side in submitted}
    except Exception as exc:  # noqa: BLE001 - the preview is saved without them
        logger.warning("preview fixture=%s internationals not matched: %s", fixture.id, type(exc).__name__)
        return {"home": [], "away": []}


def store_internationals(conn: Any, fixture: Fixture, rows: dict[str, list[dict[str, Any]]], now: datetime) -> None:
    """Upsert the matched rows under each side's club, in a savepoint so that a failure here
    leaves the preview insert alone."""
    for side, club_id in (("home", fixture.home_id), ("away", fixture.away_id)):
        if not rows[side] or club_id is None:
            continue
        try:
            with conn.begin_nested():
                internationals.upsert(conn, club_id, rows[side], now)
        except Exception as exc:  # noqa: BLE001 - the preview is saved without them
            logger.warning("preview fixture=%s internationals not stored: %s", fixture.id, type(exc).__name__)


@router.post("/previews", response_model=StoredPreview, status_code=201)
def save_preview(body: PreviewSubmission, request: Request, response: Response) -> Any:
    centre = match_centre_for(request, body.competitionId)
    now = now_utc()
    fixture = open_fixture(centre, body.fixtureId, now)
    to_store = matched_internationals(centre, fixture, body, now)
    values = {
        "competition_id": centre.competition.id,
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
        "research": body.research.model_dump(mode="json") if body.research else None,
    }
    try:
        with engine_of(request).begin() as conn:
            row, created = previews.save(conn, values)
            # In the preview's transaction, after its insert: a retried run id returns the
            # stored preview with created False and is not written twice.
            if created:
                store_internationals(conn, fixture, to_store, now)
    except previews.PreviewConflict as exc:
        raise HTTPException(status_code=409, detail={"code": "preview_conflict", "message": str(exc)}) from exc
    if not created:
        response.status_code = 200
    return {
        "id": str(row.id),
        "competitionId": row.competition_id,
        "fixtureId": row.fixture_id,
        "revision": row.revision,
        "generatedAt": row.generated_at,
    }
