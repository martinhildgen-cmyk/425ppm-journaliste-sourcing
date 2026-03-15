"""Tests for enrichment endpoints and circuit breaker."""

import pytest
from httpx import AsyncClient

from app.services.circuit_breaker import CircuitBreaker, CircuitBreakerOpen, CircuitState


# ── Circuit Breaker Tests ───────────────────────────────────────────────────


def test_circuit_breaker_starts_closed():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=1)
    assert cb.state == CircuitState.CLOSED


def test_circuit_breaker_opens_after_failures():
    cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=60)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED
    cb.record_failure()
    assert cb.state == CircuitState.OPEN


def test_circuit_breaker_resets_on_success():
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=60)
    cb.record_failure()
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb._failure_count == 0


@pytest.mark.asyncio
async def test_circuit_breaker_context_manager_success():
    cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=60)
    async with cb:
        pass  # success
    assert cb.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_circuit_breaker_context_manager_open():
    cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=600)
    cb.record_failure()  # Opens the breaker
    with pytest.raises(CircuitBreakerOpen):
        async with cb:
            pass


# ── Enrichment Endpoint Tests ──────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.skip(reason="Requires Celery/Redis connection")
async def test_trigger_enrichment(client: AsyncClient, auth_headers: dict):
    # Create journalist
    resp = await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont", "media_name": "Le Monde"},
        headers=auth_headers,
    )
    journalist_id = resp.json()["id"]

    # Trigger enrichment (will queue but Celery not running in tests)
    resp = await client.post(
        f"/enrichment/journalists/{journalist_id}",
        headers=auth_headers,
    )
    # Should succeed even without Celery (returns task_id)
    assert resp.status_code == 200
    assert "task_id" in resp.json()


@pytest.mark.asyncio
async def test_get_journalist_articles_empty(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont"},
        headers=auth_headers,
    )
    journalist_id = resp.json()["id"]

    resp = await client.get(
        f"/enrichment/journalists/{journalist_id}/articles",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_enrichment_not_found(client: AsyncClient, auth_headers: dict):
    import uuid

    fake_id = str(uuid.uuid4())
    resp = await client.post(
        f"/enrichment/journalists/{fake_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404
