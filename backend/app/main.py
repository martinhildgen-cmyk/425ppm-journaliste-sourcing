import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import (
    ai,
    auth,
    campaigns,
    clients,
    csv_io,
    dashboard,
    enrichment,
    extension,
    health,
    journalists,
    lists,
    notes,
)

logger = logging.getLogger(__name__)

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.2,
        environment=settings.ENVIRONMENT,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("425PPM Journaliste Sourcing API starting up")
    yield
    logger.info("425PPM Journaliste Sourcing API shutting down")


app = FastAPI(
    title="425PPM Journaliste Sourcing API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.CORS_ALLOW_ALL else settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return proper JSON with CORS headers."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Erreur interne: {type(exc).__name__}: {exc}"},
    )
    # Ensure CORS headers are present on error responses
    origin = request.headers.get("origin")
    if origin:
        allowed = settings.CORS_ORIGINS if not settings.CORS_ALLOW_ALL else ["*"]
        if "*" in allowed or origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin if "*" not in allowed else "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
    return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(journalists.router)
app.include_router(clients.router)
app.include_router(campaigns.router)
app.include_router(lists.router)
app.include_router(notes.router)
app.include_router(csv_io.router)
app.include_router(enrichment.router)
app.include_router(ai.router)
app.include_router(extension.router)
app.include_router(dashboard.router)
