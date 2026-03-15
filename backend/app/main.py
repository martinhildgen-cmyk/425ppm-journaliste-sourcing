import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    ai,
    auth,
    campaigns,
    clients,
    csv_io,
    enrichment,
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
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
