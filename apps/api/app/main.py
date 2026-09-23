"""FastAPI entrypoint. Vercel detects the module-level `app` in app/main.py."""

import re
import uuid

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.db import get_engine
from app.matchcentre.cache import MemorySnapshotCache, PostgresSnapshotCache, SnapshotCache
from app.matchcentre.service import MatchCentreService, default_http_factory
from app.routers import health, matches

REQUEST_ID_HEADER = "X-Request-ID"
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def create_app(
    settings: Settings | None = None,
    *,
    http_transport: httpx.BaseTransport | None = None,
    snapshot_cache: SnapshotCache | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Piele API", version="0.1.0")
    app.state.settings = settings
    app.state.match_centre = MatchCentreService(
        settings,
        snapshot_cache or _snapshot_cache(settings),
        _http_factory(settings, http_transport),
    )

    app.include_router(health.router, prefix="/v1")
    app.include_router(matches.router, prefix="/v1")

    # Added first so it sits inside the request-ID middleware below.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER, "Idempotency-Key"],
        expose_headers=[REQUEST_ID_HEADER],
    )

    @app.middleware("http")
    async def request_id_and_cache_control(request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER, "")
        request_id = incoming if _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers["Cache-Control"] = "no-store"
        return response

    return app


def _snapshot_cache(settings: Settings) -> SnapshotCache:
    engine = get_engine(settings)
    return PostgresSnapshotCache(engine) if engine is not None else MemorySnapshotCache()


def _http_factory(settings: Settings, transport: httpx.BaseTransport | None):
    if transport is None:
        return default_http_factory(settings)
    return lambda: httpx.Client(transport=transport)


app = create_app()
