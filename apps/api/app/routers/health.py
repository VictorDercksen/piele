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
    body = {"status": "ok", "environment": settings.environment, "database": "unconfigured"}
    engine = get_engine(settings)
    if engine is None:
        return JSONResponse(body)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - report failure without connection details
        logger.warning("Database health check failed: %s", type(exc).__name__)
        body.update(status="degraded", database="error")
        return JSONResponse(body, status_code=503)
    body["database"] = "ok"
    return JSONResponse(body)
