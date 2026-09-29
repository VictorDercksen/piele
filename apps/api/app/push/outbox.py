"""Queuing push messages. Every message goes to one account; the job (app/push/job.py) sends
it to each of that account's browsers.

Members turn kinds of message off per league (`league_memberships.push_muted`), by
category:

- `duties`: a duty for you; your evidence accepted or rejected.
- `cases`: evidence waiting for your vote; a veto waiting for your ruling.
- `picks`: a match you have not picked kicks off in 24 hours, and again in 1 hour.
- `matches`: teamsheets published; a Pavilion preview published.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection

from app.push.tables import push_outbox

CATEGORIES = ("duties", "cases", "picks", "matches")
KIND_CATEGORY = {
    "duty_created": "duties",
    "evidence_decided": "duties",
    "case_vote": "cases",
    "case_review": "cases",
    "pick_reminder": "picks",
    "teamsheets_published": "matches",
    "preview_published": "matches",
}
# League messages lose their point after this long.
DEFAULT_LIFETIME = timedelta(days=2)


@dataclass(frozen=True)
class Message:
    """What the browser shows. `url` is an app path; `tag` replaces an earlier message with
    the same tag on the device."""

    user_id: UUID
    league_id: UUID | None
    kind: str
    dedup_key: str
    title: str
    body: str
    url: str
    tag: str
    expires_at: datetime


def muted(push_muted: Any, kind: str) -> bool:
    return isinstance(push_muted, list) and KIND_CATEGORY[kind] in push_muted


def clip(value: str, length: int) -> str:
    return value if len(value) <= length else value[: length - 1].rstrip() + "…"


def enqueue(connection: Connection, messages: Iterable[Message]) -> None:
    """Queues the messages; one whose dedup key is already queued is skipped."""
    rows = [
        {
            "user_id": m.user_id,
            "league_id": m.league_id,
            "kind": m.kind,
            "dedup_key": clip(m.dedup_key, 200),
            "title": clip(m.title, 120),
            "body": clip(m.body, 400),
            "url": clip(m.url, 300),
            "tag": clip(m.tag, 120),
            "expires_at": m.expires_at,
        }
        for m in messages
    ]
    if rows:
        connection.execute(insert(push_outbox).on_conflict_do_nothing(index_elements=["dedup_key"]), rows)


def join_names(names: list[str]) -> str:
    """`A`, `A and B`, `A, B and C`."""
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]
