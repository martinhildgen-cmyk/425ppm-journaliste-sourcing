"""
Article text extraction — Trafilatura + newspaper4k fallback.

Usage:
    from app.services.article_extractor import ArticleExtractorService
    service = ArticleExtractorService()
    result = await service.extract(url)
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from functools import partial

import trafilatura

logger = logging.getLogger(__name__)


@dataclass
class ArticleContent:
    title: str | None
    text: str
    author: str | None
    date: str | None
    url: str


class ArticleExtractorService:
    """Extract article content from a URL using Trafilatura (with newspaper4k fallback)."""

    async def extract(self, url: str) -> ArticleContent | None:
        """Download and extract article content from *url*.

        Returns ``None`` if both extraction backends fail.
        """
        loop = asyncio.get_running_loop()

        # Try trafilatura first (sync, so run in executor).
        result = await loop.run_in_executor(None, partial(self._extract_trafilatura, url))
        if result is not None:
            return result

        # Fallback to newspaper4k.
        result = await loop.run_in_executor(None, partial(self._extract_newspaper, url))
        if result is not None:
            return result

        logger.warning("Article extraction failed for %s with all backends", url)
        return None

    # ------------------------------------------------------------------
    # Backend: Trafilatura
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_trafilatura(url: str) -> ArticleContent | None:
        try:
            downloaded = trafilatura.fetch_url(url)
            if not downloaded:
                logger.debug("Trafilatura: fetch_url returned nothing for %s", url)
                return None

            text = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=False,
                output_format="txt",
            )
            if not text:
                return None

            trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=False,
                output_format="xmltei",
                with_metadata=True,
            )
            # Grab metadata via bare_extraction for structured access.
            meta = trafilatura.bare_extraction(downloaded) or {}

            return ArticleContent(
                title=meta.get("title"),
                text=text,
                author=meta.get("author"),
                date=meta.get("date"),
                url=url,
            )
        except Exception:
            logger.exception("Trafilatura extraction error for %s", url)
            return None

    # ------------------------------------------------------------------
    # Backend: newspaper4k (optional fallback)
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_newspaper(url: str) -> ArticleContent | None:
        try:
            from newspaper import Article  # type: ignore[import-untyped]
        except ImportError:
            logger.debug("newspaper4k is not installed; skipping fallback extraction")
            return None

        try:
            article = Article(url, language="fr")
            article.download()
            article.parse()

            if not article.text:
                return None

            return ArticleContent(
                title=article.title or None,
                text=article.text,
                author=", ".join(article.authors) if article.authors else None,
                date=article.publish_date.isoformat() if article.publish_date else None,
                url=url,
            )
        except Exception:
            logger.exception("newspaper4k extraction error for %s", url)
            return None
