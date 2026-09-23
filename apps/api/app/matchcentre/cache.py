"""Read-through cache for external provider snapshots.

Snapshots live in the `piele.external_snapshots` table (supabase/migrations) so that
Vercel function instances share them and provider quotas hold. When no database is configured (local development) a
per-process dictionary stands in. Nothing here is authoritative league state.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Callable, Protocol

from sqlalchemy import Column, DateTime, Engine, MetaData, String, Table, select
from sqlalchemy.dialects.postgresql import JSONB, insert

logger = logging.getLogger(__name__)

metadata = MetaData()

external_snapshots = Table(
    "external_snapshots",
    metadata,
    Column("key", String(200), primary_key=True),
    Column("status", String(40), nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("fetched_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    schema="piele",
)


@dataclass(frozen=True)
class Snapshot:
    key: str
    status: str
    payload: dict[str, Any]
    fetched_at: datetime
    expires_at: datetime

    def fresh(self, now: datetime) -> bool:
        return self.expires_at > now


class SnapshotCache(Protocol):
    def get(self, key: str) -> Snapshot | None: ...

    def put(self, snapshot: Snapshot) -> None: ...


class MemorySnapshotCache:
    """Process-local fallback used when DATABASE_URL is unset."""

    def __init__(self) -> None:
        self._items: dict[str, Snapshot] = {}
        self._lock = Lock()

    def get(self, key: str) -> Snapshot | None:
        with self._lock:
            return self._items.get(key)

    def put(self, snapshot: Snapshot) -> None:
        with self._lock:
            self._items[snapshot.key] = snapshot


class PostgresSnapshotCache:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def get(self, key: str) -> Snapshot | None:
        with self._engine.connect() as connection:
            row = connection.execute(
                select(external_snapshots).where(external_snapshots.c.key == key)
            ).one_or_none()
        if row is None:
            return None
        return Snapshot(row.key, row.status, row.payload, row.fetched_at, row.expires_at)

    def put(self, snapshot: Snapshot) -> None:
        statement = insert(external_snapshots).values(
            key=snapshot.key,
            status=snapshot.status,
            payload=snapshot.payload,
            fetched_at=snapshot.fetched_at,
            expires_at=snapshot.expires_at,
        )
        statement = statement.on_conflict_do_update(
            index_elements=[external_snapshots.c.key],
            set_={
                "status": statement.excluded.status,
                "payload": statement.excluded.payload,
                "fetched_at": statement.excluded.fetched_at,
                "expires_at": statement.excluded.expires_at,
            },
        )
        with self._engine.begin() as connection:
            connection.execute(statement)


class ProviderError(RuntimeError):
    """An upstream answered with an application-level error. Its message is public-safe."""


@dataclass(frozen=True)
class Fetched:
    """A provider result: the status stored with it and how long it stays fresh."""

    status: str
    payload: dict[str, Any]
    ttl: timedelta


def _reason(exc: Exception) -> str:
    """A short public-safe cause: the upstream HTTP status when there is one."""
    if isinstance(exc, ProviderError):
        return f"provider error: {exc}"[:320]
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return f"HTTP {status}" if status else type(exc).__name__


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def cached(
    cache: SnapshotCache,
    key: str,
    fetch: Callable[[], Fetched],
    *,
    now: datetime | None = None,
) -> Snapshot:
    """Return a fresh snapshot, fetching and storing when missing or expired.

    A failing fetch falls back to the stale snapshot when it holds data, so a provider
    outage degrades to older data instead of an error. A stale failure is replaced by
    the new one so the latest reason is reported. Cache failures are logged and
    the fetched value is still returned.
    """
    moment = now or now_utc()
    try:
        existing = cache.get(key)
    except Exception as exc:  # noqa: BLE001 - a cache read must not break the response
        logger.warning("Snapshot read failed for %s: %s", key, type(exc).__name__)
        existing = None
    if existing and existing.fresh(moment):
        return existing
    try:
        fetched = fetch()
    except Exception as exc:  # noqa: BLE001 - provider failures become a status
        logger.warning("Fetch failed for %s: %s", key, type(exc).__name__)
        if existing and existing.status != "unavailable":
            return existing
        fetched = Fetched("unavailable", {"reason": _reason(exc)}, timedelta(minutes=5))
    snapshot = Snapshot(key, fetched.status, fetched.payload, moment, moment + fetched.ttl)
    try:
        cache.put(snapshot)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Snapshot write failed for %s: %s", key, type(exc).__name__)
    return snapshot
