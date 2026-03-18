"""Enrichment API — trigger enrichment and track progress via SSE."""

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_session
from app.models.content import Content
from app.models.journalist import Journalist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enrichment", tags=["enrichment"])


def _parse_date(date_str: str) -> datetime | None:
    """Parse a date string — handles both ISO dates and relative ages like '2 hours ago'."""
    if not date_str:
        return None

    # Try relative age: "2 hours ago", "3 days ago", etc.
    match = re.match(r"(\d+)\s+(hour|day|week|month|minute)s?\s+ago", date_str, re.IGNORECASE)
    if match:
        amount = int(match.group(1))
        unit = match.group(2).lower()
        now = datetime.now(timezone.utc)
        if unit == "minute":
            return now - timedelta(minutes=amount)
        elif unit == "hour":
            return now - timedelta(hours=amount)
        elif unit == "day":
            return now - timedelta(days=amount)
        elif unit == "week":
            return now - timedelta(weeks=amount)
        elif unit == "month":
            return now - timedelta(days=amount * 30)
        return now

    # Try standard date parsing
    from dateutil import parser as dateparser

    try:
        return dateparser.parse(date_str)
    except (ValueError, TypeError):
        return None


@router.post("/journalists/{journalist_id}")
async def trigger_enrichment(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Trigger full enrichment (articles) for a journalist.

    Runs synchronously inline — no Celery worker needed.
    """
    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    journalist = result.scalar_one_or_none()
    if not journalist:
        raise HTTPException(status_code=404, detail="Journalist not found")

    articles_found = 0
    errors = []
    debug_query = None

    # Article discovery via Brave Search
    if journalist.first_name and journalist.last_name and settings.BRAVE_SEARCH_API_KEY:
        try:
            from app.services.article_extractor import ArticleExtractorService
            from app.services.brave_search import BraveSearchService, build_article_query

            query = build_article_query(
                journalist.first_name, journalist.last_name, journalist.media_name
            )
            debug_query = query
            logger.warning("Enrichment query: %s", query)

            search_service = BraveSearchService(settings.BRAVE_SEARCH_API_KEY)
            articles = await search_service.search_articles(query, count=10)
            logger.warning("Enrichment found %d articles for query: %s", len(articles), query)

            extractor = ArticleExtractorService()
            for article in articles:
                # Check if already in DB
                existing = await session.execute(select(Content).where(Content.url == article.url))
                if existing.scalar_one_or_none():
                    continue

                # Extract full text
                body_text = None
                try:
                    extracted = await extractor.extract(article.url)
                    if extracted:
                        body_text = extracted.text
                except Exception:
                    pass

                # Parse published_date string to datetime
                pub_date = None
                if article.published_date:
                    pub_date = _parse_date(article.published_date)

                content = Content(
                    journalist_id=journalist.id,
                    url=article.url,
                    title=article.title,
                    content_type="article",
                    body_text=body_text or article.description,
                    published_at=pub_date,
                )
                session.add(content)
                articles_found += 1

            await session.commit()
        except Exception as e:
            logger.warning("Article enrichment failed for %s: %s", journalist_id, e)
            errors.append(f"Articles: {e}")
    elif not settings.BRAVE_SEARCH_API_KEY:
        errors.append("Brave Search API key not configured")

    return {
        "status": "completed",
        "articles_found": articles_found,
        "errors": errors,
        "debug_query": debug_query,
    }


@router.post("/journalists/{journalist_id}/email")
async def trigger_email_enrichment(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Trigger email-only enrichment for a journalist."""
    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Journalist not found")

    from app.tasks import enrich_email_task

    task = enrich_email_task.delay(str(journalist_id))
    return {"task_id": task.id, "status": "queued"}


@router.post("/journalists/{journalist_id}/articles")
async def trigger_article_discovery(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Trigger article discovery for a journalist."""
    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Journalist not found")

    from app.tasks import discover_articles_task

    task = discover_articles_task.delay(str(journalist_id))
    return {"task_id": task.id, "status": "queued"}


@router.get("/tasks/{task_id}")
async def get_task_status(
    task_id: str,
    _user: dict = Depends(get_current_user),
):
    """Get Celery task status."""
    from app.worker import celery_app

    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": str(result.result) if result.result else None,
    }


@router.get("/journalists/{journalist_id}/articles")
async def get_journalist_articles(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Get the 5 most recent articles for a journalist."""
    result = await session.execute(
        select(Content)
        .where(Content.journalist_id == journalist_id)
        .order_by(Content.published_at.desc().nullslast())
        .limit(10)
    )
    articles = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "url": a.url,
            "content_type": a.content_type,
            "published_at": a.published_at.isoformat() if a.published_at else None,
            "has_text": bool(a.body_text),
            "description": (a.body_text[:200] + "...")
            if a.body_text and len(a.body_text) > 200
            else a.body_text,
        }
        for a in articles
    ]


@router.get("/journalists/{journalist_id}/progress")
async def enrichment_progress_sse(
    journalist_id: UUID,
    _user: dict = Depends(get_current_user),
):
    """SSE endpoint for real-time enrichment progress."""

    async def event_stream():
        import asyncio

        # Check for active tasks for this journalist
        # This is a simplified SSE — in production you'd use Redis pub/sub
        for i in range(60):  # Max 60 iterations (5 minutes)
            # Check journalist status from DB
            from app.database import async_session_factory

            async with async_session_factory() as session:
                result = await session.execute(
                    select(Journalist).where(Journalist.id == journalist_id)
                )
                journalist = result.scalar_one_or_none()
                if not journalist:
                    yield f"data: {json.dumps({'status': 'error', 'message': 'Not found'})}\n\n"
                    return

                # Count articles
                articles_result = await session.execute(
                    select(Content).where(Content.journalist_id == journalist_id)
                )
                article_count = len(articles_result.scalars().all())

                data = {
                    "email_status": journalist.email_status,
                    "email": journalist.email,
                    "article_count": article_count,
                    "has_ai": journalist.ai_summary is not None,
                }
                yield f"data: {json.dumps(data)}\n\n"

                # If enrichment looks complete, stop
                if journalist.email_status != "manquant" and article_count > 0:
                    yield f"data: {json.dumps({'status': 'complete'})}\n\n"
                    return

            await asyncio.sleep(5)

        yield f"data: {json.dumps({'status': 'timeout'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
