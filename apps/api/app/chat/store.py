"""Stored chat messages (`piele.chat_messages`) and questions (`piele.chat_turns`).

Every call needs the league context and the member's auth subject set on the transaction:
row level security shows a member only their own threads.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import case, delete, insert, select
from sqlalchemy.engine import Connection

from app.league import tables as t

SCOPE = "fixture"
# A question younger than this with no stored answer means its turn is still streaming.
IN_FLIGHT = timedelta(seconds=90)
# Messages sent to the model with each new question (five earlier exchanges).
HISTORY = 10
# A thread is at most a few dozen rows (two per question); this only bounds a read.
THREAD_READ_LIMIT = 200
MAX_TEXT = 4000


@dataclass(frozen=True)
class Message:
    id: UUID
    role: str
    text: str
    sources: list[dict[str, Any]]
    status: str
    created_at: datetime


def _thread(league_id: UUID, membership_id: UUID, fixture_id: str):
    m = t.chat_messages
    return (m.c.league_id == league_id) & (m.c.membership_id == membership_id) & (m.c.scope_kind == SCOPE) & (m.c.scope_key == fixture_id)


def thread(connection: Connection, league_id: UUID, membership_id: UUID, fixture_id: str) -> list[Message]:
    """The thread oldest first. A question sorts before its answer if both carry one time."""
    m = t.chat_messages
    rows = connection.execute(
        select(m.c.id, m.c.role, m.c.text, m.c.sources, m.c.status, m.c.created_at)
        .where(_thread(league_id, membership_id, fixture_id))
        .order_by(m.c.created_at.desc(), case((m.c.role == "assistant", 0), else_=1))
        .limit(THREAD_READ_LIMIT)
    ).all()
    return [
        Message(row.id, row.role, row.text, list(row.sources or []), row.status, row.created_at) for row in reversed(rows)
    ]


def in_flight(messages: Sequence[Message], now: datetime) -> bool:
    """Whether the thread's last message is a recent question still waiting for its answer."""
    return bool(messages) and messages[-1].role == "user" and messages[-1].created_at > now - IN_FLIGHT


def history(messages: Sequence[Message]) -> list[dict[str, str]]:
    """The last exchanges for the model, oldest first: each question with its complete answer.
    A question whose answer failed or was stopped is left out with it, so roles alternate."""
    pairs: list[dict[str, str]] = []
    for question, answer in zip(messages, messages[1:]):
        if question.role == "user" and answer.role == "assistant" and answer.status == "complete":
            pairs += [{"role": "user", "content": question.text}, {"role": "assistant", "content": answer.text}]
    return pairs[-HISTORY:]


def insert_question(
    connection: Connection, *, league_id: UUID, season_id: UUID, membership_id: UUID, fixture_id: str, text: str, now: datetime
) -> UUID:
    """The member's question, and the turn that counts against the limits."""
    connection.execute(
        insert(t.chat_turns).values(
            league_id=league_id, membership_id=membership_id, scope_kind=SCOPE, scope_key=fixture_id, created_at=now
        )
    )
    return connection.execute(
        insert(t.chat_messages)
        .values(
            league_id=league_id,
            season_id=season_id,
            membership_id=membership_id,
            scope_kind=SCOPE,
            scope_key=fixture_id,
            role="user",
            text=text,
            sources=[],
            status="complete",
            created_at=now,
        )
        .returning(t.chat_messages.c.id)
    ).scalar_one()


def insert_answer(
    connection: Connection,
    *,
    league_id: UUID,
    season_id: UUID,
    membership_id: UUID,
    fixture_id: str,
    text: str,
    sources: list[dict[str, str]],
    usage: dict[str, Any] | None,
    model: str | None,
    status: str,
    now: datetime,
) -> UUID:
    return connection.execute(
        insert(t.chat_messages)
        .values(
            league_id=league_id,
            season_id=season_id,
            membership_id=membership_id,
            scope_kind=SCOPE,
            scope_key=fixture_id,
            role="assistant",
            text=text[:MAX_TEXT],
            sources=sources,
            usage=usage,
            model=model[:100] if model else None,
            status=status,
            created_at=now,
        )
        .returning(t.chat_messages.c.id)
    ).scalar_one()


def delete_thread(connection: Connection, league_id: UUID, membership_id: UUID, fixture_id: str) -> None:
    """Clears the member's messages about the fixture. The questions stay counted."""
    connection.execute(delete(t.chat_messages).where(_thread(league_id, membership_id, fixture_id)))


def view(message: Message) -> dict[str, Any]:
    return {
        "id": message.id,
        "role": message.role,
        "text": message.text,
        "sources": [{"url": s.get("url"), "title": s.get("title")} for s in message.sources if isinstance(s, dict)],
        "status": message.status,
        "createdAt": message.created_at,
    }
