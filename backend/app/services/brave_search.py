"""
Brave Search API — article discovery for journalists.

Usage:
    from app.services.brave_search import BraveSearchService
    service = BraveSearchService(api_key)
    articles = await service.search_articles("Marie Dupont Le Monde", count=5)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
NEWS_SEARCH_URL = "https://api.search.brave.com/res/v1/news/search"

# Domains that are social media, directory, or profile aggregator sites.
_FILTERED_DOMAINS = {
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "tiktok.com",
    "linkedin.com",
    "youtube.com",
    "pinterest.com",
    "pagesjaunes.fr",
    "societe.com",
    "kompass.com",
    "cision.com",
    "prowly.com",
    "meltwater.com",
    "prezly.com",
}

# URL path patterns that indicate a profile/author page rather than an article.
_PROFILE_PATTERNS = [
    "/author/",
    "/auteur/",
    "/journaliste/",
    "/journalist/",
    "/profile/",
    "/profil/",
    "/contributor/",
    "/signataires/",
    "ses-dernieres-publications",
    "ses-derniers-articles",
    "biographie",
]

# Known media name → domain mappings for targeted site: searches.
_MEDIA_DOMAINS: dict[str, str] = {
    "le monde": "lemonde.fr",
    "le figaro": "lefigaro.fr",
    "libération": "liberation.fr",
    "liberation": "liberation.fr",
    "les echos": "lesechos.fr",
    "les échos": "lesechos.fr",
    "l'express": "lexpress.fr",
    "le point": "lepoint.fr",
    "l'obs": "nouvelobs.com",
    "le parisien": "leparisien.fr",
    "mediapart": "mediapart.fr",
    "france info": "francetvinfo.fr",
    "franceinfo": "francetvinfo.fr",
    "20 minutes": "20minutes.fr",
    "ouest-france": "ouest-france.fr",
    "la tribune": "latribune.fr",
    "challenges": "challenges.fr",
    "bfm": "bfmtv.com",
    "tf1": "tf1info.fr",
    "france 24": "france24.com",
    "rfi": "rfi.fr",
    "huffington post": "huffingtonpost.fr",
    "huffpost": "huffingtonpost.fr",
    "slate": "slate.fr",
    "konbini": "konbini.com",
    "numerama": "numerama.com",
    "01net": "01net.com",
    "la croix": "la-croix.com",
    "courrier international": "courrierinternational.com",
    "capital": "capital.fr",
    "europe 1": "europe1.fr",
}


def build_article_query(first_name: str, last_name: str, media_name: str | None = None) -> str:
    """Build a search query to find articles by a journalist."""
    name_part = f'"{first_name} {last_name}"'

    if media_name:
        return f"{name_part} {media_name}"

    return name_part


@dataclass
class ArticleResult:
    title: str
    url: str
    description: str | None
    published_date: str | None


class BraveSearchService:
    """Async client for the Brave Web Search API."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.BRAVE_SEARCH_API_KEY

    async def search_articles(
        self,
        query: str,
        count: int = 5,
    ) -> list[ArticleResult]:
        """Search for articles matching *query* using Brave News API first, then Web.

        News API returns actual articles with dates. Web API is used as fallback.
        """
        # Try News API first — returns real articles
        articles = await self._search_news(query, count)
        if articles:
            return articles

        # Fallback to Web API with filtering
        return await self._search_web(query, count)

    async def _search_news(self, query: str, count: int) -> list[ArticleResult]:
        """Search using Brave News API — returns actual news articles."""
        headers = {
            "X-Subscription-Token": self.api_key,
            "Accept": "application/json",
        }
        # Strip quotes and operators for News API (works best with plain text)
        clean_query = query.replace('"', "").replace("site:", "").strip()
        logger.info("Brave News API query: %s", clean_query)
        params = {
            "q": clean_query,
            "count": count,
        }

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    NEWS_SEARCH_URL,
                    headers=headers,
                    params=params,
                )
                resp.raise_for_status()
                body = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Brave News API error %s: %s", exc.response.status_code, exc.response.text
            )
            return []
        except Exception:
            logger.exception("Brave News API: unexpected error")
            return []

        raw_results = body.get("results", [])
        logger.info(
            "Brave News API returned %d results (keys: %s)",
            len(raw_results),
            list(body.keys()),
        )
        articles: list[ArticleResult] = []

        for item in raw_results:
            url: str = item.get("url", "")
            title: str = item.get("title", "")
            if self._is_filtered(url):
                continue

            articles.append(
                ArticleResult(
                    title=title,
                    url=url,
                    description=item.get("description"),
                    published_date=item.get("age") or item.get("page_age"),
                )
            )
            if len(articles) >= count:
                break

        return articles

    async def _search_web(self, query: str, count: int) -> list[ArticleResult]:
        """Fallback: search using Brave Web API with filtering."""
        headers = {
            "X-Subscription-Token": self.api_key,
            "Accept": "application/json",
        }
        params = {
            "q": query,
            "count": 20,
            "search_lang": "fr",
        }

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    WEB_SEARCH_URL,
                    headers=headers,
                    params=params,
                )
                resp.raise_for_status()
                body = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Brave Web Search error %s: %s", exc.response.status_code, exc.response.text
            )
            return []
        except Exception:
            logger.exception("Brave Web Search: unexpected error")
            return []

        raw_results = body.get("web", {}).get("results", [])
        articles: list[ArticleResult] = []

        for item in raw_results:
            url: str = item.get("url", "")
            title: str = item.get("title", "")
            if self._is_filtered(url):
                continue
            if self._is_likely_profile(title):
                continue

            articles.append(
                ArticleResult(
                    title=title,
                    url=url,
                    description=item.get("description"),
                    published_date=item.get("page_age"),
                )
            )
            if len(articles) >= count:
                break

        return articles

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_filtered(url: str) -> bool:
        """Return True if the URL belongs to a filtered domain or is a profile page."""
        url_lower = url.lower()
        try:
            # Check domain
            host = url_lower.split("//", 1)[1].split("/", 1)[0]
            for domain in _FILTERED_DOMAINS:
                if host == domain or host.endswith(f".{domain}"):
                    return True
        except (IndexError, AttributeError):
            pass

        # Check URL path patterns that indicate profile/author pages
        for pattern in _PROFILE_PATTERNS:
            if pattern in url_lower:
                return True

        return False

    @staticmethod
    def _is_likely_profile(title: str) -> bool:
        """Return True if the title looks like a journalist profile page."""
        title_lower = title.lower()
        profile_signals = [
            "ses dernières publications",
            "ses dernieres publications",
            "ses derniers articles",
            "'s profile",
            "profil de",
            "biographie de",
            "journalist |",
            "journaliste |",
            "tous les articles de",
            "all articles by",
        ]
        return any(signal in title_lower for signal in profile_signals)
