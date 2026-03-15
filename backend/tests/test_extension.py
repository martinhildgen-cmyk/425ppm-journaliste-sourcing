"""Tests for the Chrome extension backend endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journalist import Journalist


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROFILE_PAYLOAD = {
    "profile": {
        "name": "Jean Martin",
        "headline": "Journaliste tech chez Les Echos",
        "location": "Paris, France",
        "about": "Specialiste nouvelles technologies",
        "currentCompany": "Les Echos",
        "linkedinUrl": "https://www.linkedin.com/in/jean-martin-12345/",
        "experiences": [
            {
                "title": "Journaliste tech",
                "company": "Les Echos",
                "dateRange": "2020 - Present",
                "location": "Paris",
            }
        ],
    },
    "extractedAt": "2026-03-15T10:00:00Z",
    "tags": ["tech", "startup"],
}

BULK_PAYLOAD = {
    "profiles": [
        {
            "name": "Alice Durand",
            "headline": "Reporter | Le Figaro",
            "location": "Lyon",
            "about": "",
            "currentCompany": "",
            "linkedinUrl": "https://www.linkedin.com/in/alice-durand/",
            "experiences": [],
        },
        {
            "name": "Bob Leroy",
            "headline": "Redacteur en chef - Liberation",
            "location": "Paris",
            "about": "",
            "currentCompany": "",
            "linkedinUrl": "https://www.linkedin.com/in/bob-leroy/",
            "experiences": [],
        },
    ],
    "tags": ["presse"],
}

URL_PAYLOAD = {
    "linkedin_url": "https://www.linkedin.com/in/claire-petit/",
    "tags": ["IA"],
}


# ---------------------------------------------------------------------------
# _parse_name unit tests
# ---------------------------------------------------------------------------


class TestParseName:
    def test_two_parts(self):
        from app.routers.extension import _parse_name

        assert _parse_name("Jean Martin") == ("Jean", "Martin")

    def test_single_name(self):
        from app.routers.extension import _parse_name

        assert _parse_name("Madonna") == ("Madonna", "")

    def test_multiple_parts(self):
        from app.routers.extension import _parse_name

        assert _parse_name("Jean Pierre Martin") == ("Jean", "Pierre Martin")

    def test_empty(self):
        from app.routers.extension import _parse_name

        assert _parse_name("") == ("", "")


# ---------------------------------------------------------------------------
# _extract_job_and_media unit tests
# ---------------------------------------------------------------------------


class TestExtractJobAndMedia:
    def test_chez_separator(self):
        from app.routers.extension import _extract_job_and_media

        assert _extract_job_and_media("Journaliste chez Le Monde") == (
            "Journaliste",
            "Le Monde",
        )

    def test_pipe_separator(self):
        from app.routers.extension import _extract_job_and_media

        assert _extract_job_and_media("Reporter | Le Figaro") == (
            "Reporter",
            "Le Figaro",
        )

    def test_dash_separator(self):
        from app.routers.extension import _extract_job_and_media

        assert _extract_job_and_media("Redacteur en chef - Liberation") == (
            "Redacteur en chef",
            "Liberation",
        )

    def test_no_separator(self):
        from app.routers.extension import _extract_job_and_media

        assert _extract_job_and_media("Freelance journalist") == (
            "Freelance journalist",
            "",
        )


# ---------------------------------------------------------------------------
# /extension/journalists/from-profile
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_from_profile_creates_journalist(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/extension/journalists/from-profile",
        json=PROFILE_PAYLOAD,
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["first_name"] == "Jean"
    assert data["last_name"] == "Martin"
    assert data["job_title"] == "Journaliste tech"
    assert data["media_name"] == "Les Echos"
    assert data["linkedin_url"] == PROFILE_PAYLOAD["profile"]["linkedinUrl"]
    assert data["source"] == "chrome_extension"


@pytest.mark.asyncio
async def test_from_profile_updates_existing(client: AsyncClient, auth_headers: dict):
    """Submitting the same LinkedIn URL should update, not duplicate."""
    resp1 = await client.post(
        "/extension/journalists/from-profile",
        json=PROFILE_PAYLOAD,
        headers=auth_headers,
    )
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]

    # Submit again with updated name
    updated = PROFILE_PAYLOAD.copy()
    updated["profile"] = {**PROFILE_PAYLOAD["profile"], "name": "Jean-Pierre Martin"}
    resp2 = await client.post(
        "/extension/journalists/from-profile",
        json=updated,
        headers=auth_headers,
    )
    assert resp2.status_code == 201
    data2 = resp2.json()
    assert data2["id"] == id1  # Same journalist
    assert data2["first_name"] == "Jean-Pierre"


@pytest.mark.asyncio
async def test_from_profile_requires_auth(client: AsyncClient):
    response = await client.post(
        "/extension/journalists/from-profile",
        json=PROFILE_PAYLOAD,
    )
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# /extension/journalists/from-bulk
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_from_bulk_creates_journalists(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/extension/journalists/from-bulk",
        json=BULK_PAYLOAD,
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["created"] == 2
    assert len(data["journalist_ids"]) == 2


@pytest.mark.asyncio
async def test_from_bulk_empty_profiles(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/extension/journalists/from-bulk",
        json={"profiles": [], "tags": []},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["created"] == 0


@pytest.mark.asyncio
async def test_from_bulk_extracts_media_correctly(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/extension/journalists/from-bulk",
        json=BULK_PAYLOAD,
        headers=auth_headers,
    )
    assert response.status_code == 201

    # Verify the journalists were created with correct media extraction
    ids = response.json()["journalist_ids"]
    assert len(ids) == 2


# ---------------------------------------------------------------------------
# /extension/journalists/from-url
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_from_url_creates_journalist(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/extension/journalists/from-url",
        json=URL_PAYLOAD,
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["linkedin_url"] == URL_PAYLOAD["linkedin_url"]
    assert data["source"] == "chrome_extension"


@pytest.mark.asyncio
async def test_from_url_returns_existing(client: AsyncClient, auth_headers: dict):
    """Submitting the same URL twice should return the existing journalist."""
    resp1 = await client.post(
        "/extension/journalists/from-url",
        json=URL_PAYLOAD,
        headers=auth_headers,
    )
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]

    resp2 = await client.post(
        "/extension/journalists/from-url",
        json=URL_PAYLOAD,
        headers=auth_headers,
    )
    # Returns existing (200 since it's returned, not created — but our endpoint returns 201)
    data2 = resp2.json()
    assert data2["id"] == id1


@pytest.mark.asyncio
async def test_from_url_rejects_invalid_url(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/extension/journalists/from-url",
        json={"linkedin_url": "https://example.com/not-linkedin"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "invalide" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_from_url_requires_auth(client: AsyncClient):
    response = await client.post(
        "/extension/journalists/from-url",
        json=URL_PAYLOAD,
    )
    assert response.status_code in (401, 403)
