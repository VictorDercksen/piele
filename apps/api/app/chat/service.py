"""The match chat's flow. A question is two short transactions around the provider reads and
the agent's stream, never one held across them (see app/matchcentre/updates.py: the
runtime pool has one connection, which the snapshot cache also needs):

1. `begin`: resolve the member, check the window, the busy rule and the limits, store the
   question, and read the thread, the preview (with its research), the picks the member
   may see and the member's own details.
2. `gather`: no transaction. The match centre's teamsheets, forecast and score, the form
   (season results and past seasons), then the context document.
3. `ask`: the agent's stream, relayed to the browser.
4. `finish`: store the answer (or what is left of it) once the stream ends, however it ends.

Logs carry the request id, membership id, fixture id, status and token counts only: never
the question, the answer, the context or the agent token.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable
from uuid import UUID

import anyio
import httpx
from fastapi import HTTPException
from sqlalchemy.engine import Connection, Engine
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from app.agent import internationals, previews
from app.agent.form import build_form
from app.agent.state import build_state
from app.chat import context, glossary, limits, relay, store
from app.competitions import Competition
from app.config import Settings
from app.league import service as league
from app.league.auth import Claims
from app.league.context import Actor, actor_for, require_membership, resolve_account, set_context
from app.matchcentre.schedule import Fixture
from app.matchcentre.service import MatchCentreService

logger = logging.getLogger(__name__)


def now():
    """The league service's clock, so the chat window and the pick visibility it quotes agree."""
    return league.now_utc()


def chat_fixture(actor: Actor, fixture_id: str) -> Fixture:
    fixture = actor.competition.schedule().fixture(fixture_id)
    if fixture is None:
        raise league.problem(404, "unknown_fixture", "Unknown match.")
    return fixture


# Reading and clearing a thread (one transaction, actor_dependency's) ----------------------


def thread_view(actor: Actor, settings: Settings, fixture_id: str) -> dict[str, Any]:
    membership_id = require_membership(actor)
    fixture = chat_fixture(actor, fixture_id)
    moment = now()
    counts = limits.used(actor.connection, actor.league_id, membership_id, fixture.id, moment, everywhere=False)
    remaining = limits.remaining(settings, counts)
    messages = store.thread(actor.connection, actor.league_id, membership_id, fixture.id)
    return {
        "fixtureId": fixture.id,
        "open": limits.is_open(fixture, actor.season_closed_at, moment),
        "remainingInThread": remaining.thread,
        "remainingToday": remaining.today,
        "messages": [store.view(message) for message in messages],
    }


def clear(actor: Actor, fixture_id: str) -> None:
    membership_id = require_membership(actor)
    fixture = chat_fixture(actor, fixture_id)
    store.delete_thread(actor.connection, actor.league_id, membership_id, fixture.id)


# Asking ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Turn:
    """What the first transaction hands to the rest of the request: plain values only."""

    request_id: str
    auth_subject: UUID
    league_id: UUID
    season_id: UUID
    membership_id: UUID
    competition: Competition
    fixture: Fixture
    question: str
    history: list[dict[str, str]]
    remaining: limits.Remaining
    facts: dict[str, Any]


def begin(
    engine: Engine, claims: Claims, request_id: str, league_id: UUID, fixture_id: str, question: str, settings: Settings
) -> Turn:
    """Transaction one: checks, the stored question and the database's share of the context."""
    with engine.begin() as connection:
        actor = actor_for(resolve_account(connection, claims, request_id), league_id)
        membership_id = require_membership(actor)
        fixture = chat_fixture(actor, fixture_id)
        moment = now()
        if not limits.is_open(fixture, actor.season_closed_at, moment):
            raise league.problem(409, "chat_closed", "The chat opens three days before kickoff and closes at kickoff.")
        messages = store.thread(connection, actor.league_id, membership_id, fixture.id)
        # Busy: another first transaction for this thread is running right now (the advisory
        # lock, released at commit), or an earlier question is still streaming (its answer is
        # not stored yet and it is younger than store.IN_FLIGHT). The lock cannot span the
        # stream, so the stored question is the marker for the second case.
        if not limits.try_lock(connection, membership_id, fixture.id) or store.in_flight(messages, moment):
            raise league.problem(429, "chat_busy", "The Pavilion is still answering your last question.")
        counts = limits.used(connection, actor.league_id, membership_id, fixture.id, moment)
        limits.check(settings, counts)
        store.insert_question(
            connection,
            league_id=actor.league_id,
            season_id=actor.season_id,
            membership_id=membership_id,
            fixture_id=fixture.id,
            text=question,
            now=moment,
        )
        preview = previews.latest(connection, actor.competition.id, fixture.id)
        picks = league.fixture_picks(actor, fixture.id)
        facts = _facts(actor, fixture, preview, picks, _known_internationals(connection, fixture))
    after = limits.Used(counts.thread + 1, counts.today + 1, counts.everywhere + 1)
    return Turn(
        request_id=request_id,
        auth_subject=claims.subject,
        league_id=actor.league_id,
        season_id=actor.season_id,
        membership_id=membership_id,
        competition=actor.competition,
        fixture=fixture,
        question=question,
        history=store.history(messages),
        remaining=limits.remaining(settings, after),
        facts=facts,
    )


def _known_internationals(connection: Connection, fixture: Fixture) -> dict[str, list[dict[str, Any]]]:
    """Both clubs' stored international records, as plain values. A read that fails (the table
    is not there yet) is rolled back to its savepoint and leaves the records out: the question
    is still answered, and its transaction survives."""
    try:
        with connection.begin_nested():
            return internationals.for_clubs(connection, [fixture.home_id, fixture.away_id])
    except Exception as exc:  # noqa: BLE001 - the chat still answers from what it has
        logger.warning("chat fixture=%s internationals not read: %s", fixture.id, type(exc).__name__)
        return {}


def _facts(
    actor: Actor, fixture: Fixture, preview: Any, picks: dict[str, Any], known: dict[str, list[dict[str, Any]]] | None = None
) -> dict[str, Any]:
    competition = actor.competition
    home, away = competition.club(fixture.home_id), competition.club(fixture.away_id)
    stadium = competition.stadium(fixture.venue)
    favourite = competition.club(actor.favourite_team_id)
    # fixture_picks leaves `picks` empty while the pool is hidden from the member; once the
    # match is locked an empty list means nobody picked.
    pool = picks["picks"] if picks["picks"] or picks["locked"] else None
    return {
        "timezone": actor.league_timezone,
        "competition": competition.name,
        "fixture": {
            "id": fixture.id,
            "round": fixture.round,
            "roundLabel": competition.round_label(fixture.round),
            "home": home.name if home else fixture.home_id or "To be decided",
            "away": away.name if away else fixture.away_id or "To be decided",
            "kickoffUtc": fixture.kickoff_utc,
            "venue": fixture.venue,
            "city": stadium.city if stadium else None,
            "country": stadium.country if stadium else None,
        },
        "preview": (
            {
                "revision": preview.revision,
                "generatedAt": preview.generated_at,
                "summary": preview.summary,
                "keyFactors": preview.key_factors,
                "sentiment": preview.sentiment,
                "sources": preview.sources,
            }
            if preview is not None
            else None
        ),
        "research": preview.research if preview is not None else None,
        # Every record of each club's players, with its source; context.py keeps those of the
        # selected players once the teamsheets are published.
        "internationals": {
            "home": (known or {}).get(fixture.home_id or "", []),
            "away": (known or {}).get(fixture.away_id or "", []),
        },
        "names": {
            "clubs": [
                {"name": club.name, "otherNames": glossary.club_aliases(competition, club)}
                for club in (home, away)
                if club is not None
            ]
        },
        "member": {
            "name": actor.display_name,
            "favouriteTeam": favourite.name if favourite else None,
            "pick": picks["myPick"],
            "pool": pool,
            "locked": picks["locked"],
        },
    }


def gather(centre: MatchCentreService, turn: Turn) -> str:
    """Provider reads through the match centre's cache, with no transaction open, then the
    context document. A provider failure leaves its section out rather than failing the turn."""
    moment = now()
    facts = {**turn.facts, "now": moment}
    try:
        sections = centre.build(turn.fixture, moment)
        facts.update(teamsheetStatus=sections["teamsheets"].get("status"), weather=sections["weather"], score=sections["score"])
        fixture = turn.fixture
        if sections["teamsheets"].get("status") == "ok" and fixture.kickoff_utc and fixture.home_id and fixture.away_id:
            facts["state"] = build_state(fixture, centre, moment)
    except Exception as exc:  # noqa: BLE001 - the chat still answers from what it has
        logger.warning("chat context request=%s fixture=%s provider read failed: %s", turn.request_id, turn.fixture.id, type(exc).__name__)
    form = gather_form(centre, turn.fixture, moment, turn.request_id)
    if form is not None:
        facts["form"] = form
    return context.build(facts)


def gather_form(centre: MatchCentreService, fixture: Fixture, moment: datetime, request_id: str) -> dict[str, Any] | None:
    """Recent results, the season record and head-to-head, whether or not the teamsheets are
    out. The season snapshot is a provider read, so this runs outside any transaction. A failure
    leaves the form out rather than failing the turn."""
    if not (fixture.kickoff_utc and fixture.home_id and fixture.away_id):
        return None
    try:
        competition = centre.competition
        return build_form(competition, fixture, centre.season_results(moment), competition.history())
    except Exception as exc:  # noqa: BLE001 - the chat still answers from what it has
        logger.warning("chat context request=%s fixture=%s form failed: %s", request_id, fixture.id, type(exc).__name__)
        return None


def finish(engine: Engine, turn: Turn, outcome: relay.Outcome) -> None:
    """Transaction two: the answer, in the member's league and identity context again."""
    with engine.begin() as connection:
        set_context(connection, "auth_subject", str(turn.auth_subject))
        set_context(connection, "league_id", str(turn.league_id))
        store.insert_answer(
            connection,
            league_id=turn.league_id,
            season_id=turn.season_id,
            membership_id=turn.membership_id,
            fixture_id=turn.fixture.id,
            text=outcome.text,
            sources=outcome.sources,
            usage=outcome.usage,
            model=outcome.model,
            status=outcome.status,
            now=now(),
        )
    usage = outcome.usage or {}
    logger.info(
        "chat turn request=%s membership=%s fixture=%s status=%s input_tokens=%s output_tokens=%s",
        turn.request_id,
        turn.membership_id,
        turn.fixture.id,
        outcome.status,
        usage.get("inputTokens"),
        usage.get("outputTokens"),
    )


def _finish_quietly(engine: Engine, turn: Turn, outcome: relay.Outcome) -> None:
    try:
        finish(engine, turn, outcome)
    except Exception as exc:  # noqa: BLE001 - the response is already on its way
        logger.error("chat turn request=%s membership=%s fixture=%s answer not stored: %s", turn.request_id, turn.membership_id, turn.fixture.id, type(exc).__name__)


def agent_request(turn: Turn, document: str) -> dict[str, Any]:
    return {
        "scope": {"kind": "fixture", "fixtureId": turn.fixture.id, "round": turn.fixture.round},
        "context": document,
        "messages": [*turn.history, {"role": "user", "content": turn.question}],
    }


def unavailable() -> HTTPException:
    return league.problem(503, "chat_unavailable", "The Pavilion cannot answer just now. Try again in a moment.")


async def ask(
    engine: Engine,
    settings: Settings,
    centres: dict[str, MatchCentreService],
    transport: httpx.AsyncBaseTransport | None,
    start: Callable[[], Turn],
) -> Response:
    """A question, answered as a stream. `start` runs transaction one (it resolves the member
    from the verified token)."""
    if not settings.piele_agent_url or not settings.agent_token:
        raise unavailable()
    turn = await run_in_threadpool(start)
    try:
        document = await run_in_threadpool(gather, centres[turn.competition.id], turn)
        url = settings.piele_agent_url.rstrip("/") + "/chat/turn"
        deadline = asyncio.get_running_loop().time() + relay.TOTAL_TIMEOUT_SECONDS
        client, upstream = await relay.open_stream(transport, url, settings.agent_token, agent_request(turn, document), deadline)
    except BaseException as exc:
        # The question is stored and counts; store a failed answer so the thread is not busy.
        # Shielded, because a browser that leaves cancels the request.
        with anyio.CancelScope(shield=True):
            await run_in_threadpool(_finish_quietly, engine, turn, relay.Outcome(relay.UNREACHABLE, "failed"))
        if isinstance(exc, relay.AgentUnavailable):
            logger.warning("chat turn request=%s membership=%s fixture=%s agent unavailable: %s", turn.request_id, turn.membership_id, turn.fixture.id, exc)
            raise unavailable() from None
        raise

    async def done(outcome: relay.Outcome) -> None:
        await run_in_threadpool(_finish_quietly, engine, turn, outcome)

    headers = {
        relay.REMAINING_THREAD_HEADER: str(turn.remaining.thread),
        relay.REMAINING_TODAY_HEADER: str(turn.remaining.today),
    }
    return relay.RelayResponse(client, upstream, deadline, headers, done)
