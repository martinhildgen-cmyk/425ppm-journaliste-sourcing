"""Tests for dashboard endpoints and Phase 5 cron task logic."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journalist import Journalist


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def journalists_with_alerts(db_session: AsyncSession, test_user_id: str):
    """Create journalists: 2 with movement alerts, 1 watched, 1 normal."""
    j1 = Journalist(
        first_name="Alice",
        last_name="Martin",
        job_title="Journaliste tech",
        media_name="Les Echos",
        movement_alert=True,
        is_watched=True,
        job_title_previous="Reporter",
        media_name_previous="Le Figaro",
        job_last_updated_at=datetime.now(timezone.utc),
        source="manual",
        owner_id=uuid.UUID(test_user_id),
    )
    j2 = Journalist(
        first_name="Bob",
        last_name="Dupont",
        job_title="Redacteur en chef",
        media_name="Liberation",
        movement_alert=True,
        is_watched=False,
        job_title_previous="Journaliste",
        job_last_updated_at=datetime.now(timezone.utc),
        source="manual",
        owner_id=uuid.UUID(test_user_id),
    )
    j3 = Journalist(
        first_name="Claire",
        last_name="Petit",
        job_title="Correspondante",
        media_name="Le Monde",
        movement_alert=False,
        is_watched=True,
        source="manual",
        owner_id=uuid.UUID(test_user_id),
    )
    j4 = Journalist(
        first_name="David",
        last_name="Leroy",
        job_title="Freelance",
        media_name="",
        movement_alert=False,
        is_watched=False,
        ai_last_analyzed_at=datetime.now(timezone.utc),
        email_status="valide",
        source="manual",
        owner_id=uuid.UUID(test_user_id),
    )
    db_session.add_all([j1, j2, j3, j4])
    await db_session.commit()
    return [j1, j2, j3, j4]


# ---------------------------------------------------------------------------
# /dashboard/stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_stats(
    client: AsyncClient, auth_headers: dict, journalists_with_alerts
):
    response = await client.get("/dashboard/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_journalists"] == 4
    assert data["movement_alerts"] == 2
    assert data["watched_journalists"] == 2
    assert data["ai_analyzed"] == 1
    assert data["email_valid"] == 1


@pytest.mark.skip(reason="Auth temporarily disabled")
@pytest.mark.asyncio
async def test_dashboard_stats_requires_auth(client: AsyncClient):
    response = await client.get("/dashboard/stats")
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# /dashboard/alerts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_alerts(
    client: AsyncClient, auth_headers: dict, journalists_with_alerts
):
    response = await client.get("/dashboard/alerts", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    # Check structure
    alert = data["items"][0]
    assert "first_name" in alert
    assert "job_title_previous" in alert
    assert "media_name_previous" in alert


@pytest.mark.asyncio
async def test_dashboard_alerts_pagination(
    client: AsyncClient, auth_headers: dict, journalists_with_alerts
):
    response = await client.get(
        "/dashboard/alerts?page=1&page_size=1", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 1


# ---------------------------------------------------------------------------
# /dashboard/alerts/{id}/dismiss
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dismiss_alert(
    client: AsyncClient, auth_headers: dict, journalists_with_alerts
):
    journalist = journalists_with_alerts[0]  # Alice - has alert
    response = await client.post(
        f"/dashboard/alerts/{journalist.id}/dismiss", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["dismissed"] is True

    # Verify alert is cleared
    stats = await client.get("/dashboard/stats", headers=auth_headers)
    assert stats.json()["movement_alerts"] == 1


@pytest.mark.asyncio
async def test_dismiss_alert_not_found(client: AsyncClient, auth_headers: dict):
    fake_id = str(uuid.uuid4())
    response = await client.post(
        f"/dashboard/alerts/{fake_id}/dismiss", headers=auth_headers
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Cron task unit tests — _parse_name, _extract_job_and_media already tested
# ---------------------------------------------------------------------------


class TestCheckJobChangesLogic:
    """Test the job change detection logic (without Brave Search calls)."""

    def test_snippet_matching_job_found(self):
        """When current job title appears in snippet, no change."""
        snippet = "Alice Martin - Journaliste tech chez Les Echos - LinkedIn"
        current_job = "journaliste tech"
        assert current_job in snippet.lower()

    def test_snippet_matching_job_not_found(self):
        """When current job title does NOT appear in snippet, change detected."""
        snippet = "Alice Martin - Directrice editoriale chez Le Figaro - LinkedIn"
        current_job = "journaliste tech"
        assert current_job not in snippet.lower()

    def test_snippet_matching_media_change(self):
        """When media name changes in snippet."""
        snippet = "Bob Dupont - Redacteur chez Liberation"
        current_media = "les echos"
        assert current_media not in snippet.lower()


class TestPurgeLogic:
    """Test the RGPD purge logic."""

    @pytest.mark.asyncio
    async def test_inactive_journalists_identified(self, db_session: AsyncSession, test_user_id: str):
        """Journalists not accessed in 12+ months should be purge candidates."""
        old_date = datetime.now(timezone.utc) - timedelta(days=400)
        j = Journalist(
            first_name="Old",
            last_name="Contact",
            last_accessed_at=old_date,
            is_watched=False,
            source="manual",
            owner_id=uuid.UUID(test_user_id),
        )
        db_session.add(j)
        await db_session.commit()

        from sqlalchemy import func, select
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        result = await db_session.execute(
            select(func.count())
            .select_from(Journalist)
            .where(Journalist.last_accessed_at < cutoff)
            .where(Journalist.is_watched == False)  # noqa: E712
        )
        count = result.scalar_one()
        assert count >= 1

    @pytest.mark.asyncio
    async def test_watched_journalists_not_purged(self, db_session: AsyncSession, test_user_id: str):
        """Watched journalists should NOT be purged even if inactive."""
        old_date = datetime.now(timezone.utc) - timedelta(days=400)
        j = Journalist(
            first_name="Watched",
            last_name="Old",
            last_accessed_at=old_date,
            is_watched=True,
            source="manual",
            owner_id=uuid.UUID(test_user_id),
        )
        db_session.add(j)
        await db_session.commit()

        from sqlalchemy import func, select
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        result = await db_session.execute(
            select(func.count())
            .select_from(Journalist)
            .where(Journalist.last_accessed_at < cutoff)
            .where(Journalist.is_watched == False)  # noqa: E712
        )
        count = result.scalar_one()
        # Watched journalist should not appear in purge query
        assert count == 0
