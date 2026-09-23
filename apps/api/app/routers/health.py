import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import Settings
from app.db import get_engine
from app.dependencies import settings_dependency

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health(settings: Settings = Depends(settings_dependency)) -> JSONResponse:
    body = {
        "status": "ok",
        "environment": settings.environment,
        "database": "unconfigured",
        "snapshotCache": "memory",
    }
    engine = get_engine(settings)
    if engine is None:
        return JSONResponse(body)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            body["snapshotCache"] = _cache_state(connection)
    except Exception as exc:  # noqa: BLE001 - report failure without connection details
        logger.warning("Database health check failed: %s", type(exc).__name__)
        body.update(status="degraded", database="error", snapshotCache="unknown")
        return JSONResponse(body, status_code=503)
    body["database"] = "ok"
    return JSONResponse(body)


def _cache_state(connection) -> str:
    """Whether the migration that creates piele.external_snapshots has been applied."""
    try:
        connection.execute(text("SELECT 1 FROM piele.external_snapshots LIMIT 0"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Snapshot cache table check failed: %s", type(exc).__name__)
        return "table missing"
    return "database"
