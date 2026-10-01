"""Pavilion match chat under /v1/leagues/{leagueId}/matches/{fixture_id}/chat. Handlers
validate input and delegate to app.chat.service. Off (404 `chat_off`) unless
PIELE_CHAT_ENABLED is set; that check runs before authentication."""

import re
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request
from fastapi.exceptions import RequestValidationError
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from sqlalchemy import Engine
from starlette.responses import Response

from app.chat import service
from app.league.auth import Claims
from app.league.context import Actor, actor_dependency, claims_dependency, engine_dependency
from app.league.service import problem
from app.routers.league import FixtureId, settings_of

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def chat_enabled(request: Request) -> None:
    if not settings_of(request).piele_chat_enabled:
        raise problem(404, "chat_off", "The match chat is not available.")


router = APIRouter(
    prefix="/leagues/{leagueId}/matches/{fixture_id}/chat", tags=["chat"], dependencies=[Depends(chat_enabled)]
)


class ChatSource(BaseModel):
    url: str
    title: str


class ChatMessage(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    text: str
    # Sources the answer cites; always empty for the member's own messages.
    sources: list[ChatSource]
    # `failed`: the answer broke off or never came; `aborted`: the member stopped it.
    status: Literal["complete", "failed", "aborted"]
    createdAt: datetime


class ChatThread(BaseModel):
    fixtureId: str
    # From three days before kickoff until kickoff, when picks lock, while the season is open.
    open: bool
    remainingInThread: int
    remainingToday: int
    messages: list[ChatMessage]


def _question(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    if _CONTROL.search(value):
        raise ValueError("must not contain control characters")
    return value


class ChatQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # At most PIELE_CHAT_MESSAGE_MAX_CHARS (default 500) once trimmed; checked by the handler.
    text: Annotated[str, Field(min_length=1, max_length=1000), AfterValidator(_question)]


@router.get("", response_model=ChatThread)
def get_chat_thread(fixture_id: FixtureId, request: Request, actor: Actor = Depends(actor_dependency)) -> Any:
    """The member's own thread about the fixture, whether it is open, and the questions left."""
    return service.thread_view(actor, settings_of(request), fixture_id)


@router.delete("", status_code=204)
def clear_chat_thread(fixture_id: FixtureId, actor: Actor = Depends(actor_dependency)) -> None:
    """Clears the member's own thread. Questions already asked still count against the limits."""
    service.clear(actor, fixture_id)


@router.post(
    "",
    response_class=Response,
    responses={
        200: {
            "description": "The agent's AI SDK UI message stream (server-sent events), relayed unchanged.",
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
        }
    },
)
async def ask_chat(
    fixture_id: FixtureId,
    body: ChatQuestion,
    request: Request,
    league_id: UUID = Path(alias="leagueId"),
    claims: Claims = Depends(claims_dependency),
    engine: Engine = Depends(engine_dependency),
) -> Response:
    """Asks a question and streams the answer. The member is resolved inside the handler's
    first short transaction (not by actor_dependency, whose transaction would stay open
    through the agent's stream)."""
    settings = settings_of(request)
    if len(body.text) > settings.piele_chat_message_max_chars:
        raise RequestValidationError(
            [{"type": "string_too_long", "loc": ("body", "text"), "msg": f"Keep questions to {settings.piele_chat_message_max_chars} characters.", "input": None}]
        )
    return await service.ask(
        engine,
        settings,
        request.app.state.match_centres,
        request.app.state.agent_transport,
        lambda: service.begin(engine, claims, request.state.request_id, league_id, fixture_id, body.text, settings),
    )
