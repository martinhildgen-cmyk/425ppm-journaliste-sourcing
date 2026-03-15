"""
Celery tasks for journalist enrichment pipeline.

Tasks:
    - enrich_journalist: Full enrichment (email + articles + extraction)
    - enrich_email: Dropcontact email lookup
    - discover_articles: Brave Search article discovery
    - extract_article: Trafilatura text extraction
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.worker import celery_app

logger = logging.getLogger(__name__)

# Async engine for Celery tasks (separate from FastAPI's)
_engine = create_async_engine(settings.DATABASE_URL, echo=False)
_session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


def _run_async(coro):
    """Run an async coroutine in a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
def enrich_journalist(self, journalist_id: str):
    """Full enrichment pipeline for a journalist.

    1. Enrich email via Dropcontact
    2. Discover articles via Brave Search
    3. Extract article text via Trafilatura
    """
    logger.info("Starting enrichment for journalist %s", journalist_id)
    _run_async(_enrich_journalist_async(self, journalist_id))


async def _enrich_journalist_async(task, journalist_id: str):
    from app.models.journalist import Journalist

    async with _session_factory() as session:
        result = await session.execute(
            select(Journalist).where(Journalist.id == journalist_id)
        )
        journalist = result.scalar_one_or_none()
        if not journalist:
            logger.error("Journalist %s not found", journalist_id)
            return

        # Step 1: Email enrichment
        if journalist.email_status == "manquant" and journalist.first_name and journalist.last_name:
            try:
                await _enrich_email(session, journalist)
            except Exception as e:
                logger.warning("Email enrichment failed for %s: %s", journalist_id, e)

        # Step 2: Article discovery + extraction
        if journalist.first_name and journalist.last_name:
            try:
                await _discover_and_extract_articles(session, journalist)
            except Exception as e:
                logger.warning("Article enrichment failed for %s: %s", journalist_id, e)

        await session.commit()
        logger.info("Enrichment complete for journalist %s", journalist_id)


async def _enrich_email(session: AsyncSession, journalist):
    """Enrich journalist email via Dropcontact with caching."""
    from app.services.cache import cache_get, cache_set
    from app.services.circuit_breaker import CircuitBreakerOpen, dropcontact_breaker
    from app.services.dropcontact import DropcontactService

    cache_key = f"dropcontact:{journalist.first_name}:{journalist.last_name}:{journalist.media_name}"
    cached = await cache_get(cache_key)

    if cached:
        _apply_dropcontact_result(journalist, cached)
        return

    if not settings.DROPCONTACT_API_KEY:
        logger.debug("Dropcontact API key not configured, skipping")
        return

    try:
        async with dropcontact_breaker:
            service = DropcontactService(settings.DROPCONTACT_API_KEY)
            result = await service.enrich(
                first_name=journalist.first_name,
                last_name=journalist.last_name,
                company=journalist.media_name or "",
            )
    except CircuitBreakerOpen:
        logger.warning("Dropcontact circuit breaker is open, skipping")
        return

    if result:
        result_dict = {
            "email": result.email,
            "email_status": result.email_status,
            "linkedin_url": result.linkedin_url,
            "phone": result.phone,
        }
        await cache_set(cache_key, result_dict)
        _apply_dropcontact_result(journalist, result_dict)


def _apply_dropcontact_result(journalist, data: dict):
    """Apply Dropcontact result to journalist model."""
    if data.get("email"):
        journalist.email = data["email"]
    if data.get("email_status"):
        journalist.email_status = data["email_status"]
    if data.get("linkedin_url") and not journalist.linkedin_url:
        journalist.linkedin_url = data["linkedin_url"]


async def _discover_and_extract_articles(session: AsyncSession, journalist):
    """Discover and extract articles for a journalist."""
    from app.models.content import Content
    from app.services.article_extractor import ArticleExtractorService
    from app.services.brave_search import BraveSearchService
    from app.services.cache import cache_get, cache_set
    from app.services.circuit_breaker import (
        CircuitBreakerOpen,
        brave_search_breaker,
        trafilatura_breaker,
    )

    query = f"{journalist.first_name} {journalist.last_name}"
    if journalist.media_name:
        query += f" {journalist.media_name}"

    cache_key = f"articles:{journalist.id}"
    cached = await cache_get(cache_key)

    if cached:
        # Articles already cached, skip discovery
        return

    if not settings.BRAVE_SEARCH_API_KEY:
        logger.debug("Brave Search API key not configured, skipping")
        return

    # Discover articles
    try:
        async with brave_search_breaker:
            search_service = BraveSearchService(settings.BRAVE_SEARCH_API_KEY)
            articles = await search_service.search_articles(query, count=5)
    except CircuitBreakerOpen:
        logger.warning("Brave Search circuit breaker is open, skipping")
        return

    if not articles:
        return

    extractor = ArticleExtractorService()
    extracted_urls = []

    for article in articles:
        # Check if already in DB
        existing = await session.execute(
            select(Content).where(Content.url == article.url)
        )
        if existing.scalar_one_or_none():
            continue

        # Extract full text
        body_text = None
        try:
            async with trafilatura_breaker:
                extracted = await extractor.extract(article.url)
                if extracted:
                    body_text = extracted.text
        except CircuitBreakerOpen:
            logger.warning("Trafilatura circuit breaker is open, using description")
        except Exception:
            pass

        content = Content(
            journalist_id=journalist.id,
            url=article.url,
            title=article.title,
            source_type="article",
            raw_text=body_text or article.description,
            published_at=article.published_date,
        )
        session.add(content)
        extracted_urls.append(article.url)

    if extracted_urls:
        await cache_set(cache_key, extracted_urls)

    logger.info(
        "Discovered %d articles for journalist %s (%d new)",
        len(articles),
        journalist.id,
        len(extracted_urls),
    )


@celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
def enrich_email_task(self, journalist_id: str):
    """Standalone email enrichment task."""
    _run_async(_enrich_email_standalone(journalist_id))


async def _enrich_email_standalone(journalist_id: str):
    from app.models.journalist import Journalist

    async with _session_factory() as session:
        result = await session.execute(
            select(Journalist).where(Journalist.id == journalist_id)
        )
        journalist = result.scalar_one_or_none()
        if not journalist:
            return
        await _enrich_email(session, journalist)
        await session.commit()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
def discover_articles_task(self, journalist_id: str):
    """Standalone article discovery task."""
    _run_async(_discover_articles_standalone(journalist_id))


async def _discover_articles_standalone(journalist_id: str):
    from app.models.journalist import Journalist

    async with _session_factory() as session:
        result = await session.execute(
            select(Journalist).where(Journalist.id == journalist_id)
        )
        journalist = result.scalar_one_or_none()
        if not journalist:
            return
        await _discover_and_extract_articles(session, journalist)
        await session.commit()
