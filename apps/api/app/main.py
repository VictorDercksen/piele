"""FastAPI entrypoint. Vercel detects the module-level `app` in app/main.py."""

import re
import uuid

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app import competitions
from app.config import Settings, get_settings
from app.db import get_engine
from app.league.auth import JwksVerifier, SecretVerifier, TokenVerifier, UnconfiguredVerifier
from app.league.storage import Storage, SupabaseStorage, UnconfiguredStorage
from app.matchcentre.cache import MemorySnapshotCache, PostgresSnapshotCache, SnapshotCache
from app.matchcentre.service import MatchCentreService, default_http_factory
from app.routers import account, admin, agent, health, league, matches

REQUEST_ID_HEADER = "X-Request-ID"
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def create_app(
    settings: Settings | None = None,
    *,
    http_transport: httpx.BaseTransport | None = None,
    snapshot_cache: SnapshotCache | None = None,
    token_verifier: TokenVerifier | None = None,
    storage: Storage | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    # Interactive docs and the schema stay off in production; generate client types locally.
    docs_off = {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(title="The Pavilion API", version="0.1.0", **(docs_off if settings.is_production else {}))
    app.state.settings = settings
    cache = snapshot_cache or _snapshot_cache(settings)
    http = _http_factory(settings, http_transport)
    # One match centre per competition, keyed by competition id; they share the cache.
    app.state.match_centres = {
        competition.id: MatchCentreService(competition, settings, cache, http) for competition in competitions.ALL.values()
    }

    app.state.token_verifier = token_verifier or _token_verifier(settings)
    app.state.storage = storage or _storage(settings)

    app.include_router(health.router, prefix="/v1")
    app.include_router(matches.router, prefix="/v1")
    app.include_router(account.router, prefix="/v1")
    app.include_router(league.router, prefix="/v1")
    app.include_router(admin.router, prefix="/v1")
    app.include_router(agent.router, prefix="/v1")

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
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    return app


def _snapshot_cache(settings: Settings) -> SnapshotCache:
    engine = get_engine(settings)
    return PostgresSnapshotCache(engine) if engine is not None else MemorySnapshotCache()


def _token_verifier(settings: Settings) -> TokenVerifier:
    if not settings.supabase_url:
        return UnconfiguredVerifier()
    if settings.supabase_jwt_secret and settings.supabase_jwt_secret.get_secret_value():
        return SecretVerifier(
            settings.supabase_url, settings.supabase_jwt_audience, settings.supabase_jwt_secret.get_secret_value()
        )
    return JwksVerifier(settings.supabase_url, settings.supabase_jwt_audience)


def _storage(settings: Settings) -> Storage:
    key = settings.supabase_service_role_key
    if not settings.supabase_url or key is None or not key.get_secret_value():
        return UnconfiguredStorage()
    return SupabaseStorage(
        settings.supabase_url, key.get_secret_value(), settings.supabase_storage_bucket, settings.external_timeout_seconds
    )


def _http_factory(settings: Settings, transport: httpx.BaseTransport | None):
    if transport is None:
        return default_http_factory(settings)
    return lambda: httpx.Client(transport=transport)


app = create_app()
