"""
Redis cache layer for enrichment results.

Caches API responses with configurable TTL to avoid redundant calls.

Usage:
    from app.services.cache import cache_get, cache_set

    cached = await cache_get("dropcontact:marie.dupont@lemonde.fr")
    if cached:
        return cached

    result = await dropcontact.enrich(...)
    await cache_set("dropcontact:marie.dupont@lemonde.fr", result, ttl=7*86400)
"""

import json
import logging

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None

# Default TTL: 7 days
DEFAULT_TTL = 7 * 86400


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def cache_get(key: str) -> dict | list | None:
    """Get a cached value by key. Returns None on miss or error."""
    try:
        r = await get_redis()
        value = await r.get(f"cache:{key}")
        if value:
            return json.loads(value)
    except Exception as e:
        logger.warning("Cache get error for %s: %s", key, e)
    return None


async def cache_set(key: str, value: dict | list, ttl: int = DEFAULT_TTL) -> None:
    """Set a cached value with TTL in seconds."""
    try:
        r = await get_redis()
        await r.set(f"cache:{key}", json.dumps(value, default=str), ex=ttl)
    except Exception as e:
        logger.warning("Cache set error for %s: %s", key, e)


async def cache_delete(key: str) -> None:
    """Delete a cached value."""
    try:
        r = await get_redis()
        await r.delete(f"cache:{key}")
    except Exception as e:
        logger.warning("Cache delete error for %s: %s", key, e)
