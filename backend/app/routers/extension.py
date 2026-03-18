"""Extension Router — endpoints for the Chrome extension to submit profiles."""

import os
import re
import uuid as uuid_mod
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_session
from app.models.journalist import Journalist
from app.models.list import List, ListJournalist
from app.schemas import (
    ExtensionBulkSubmit,
    ExtensionProfileSubmit,
    ExtensionUrlImport,
    JournalistRead,
)

router = APIRouter(prefix="/extension", tags=["extension"])


async def _add_to_campaign_list(
    session: AsyncSession,
    journalist_id: uuid_mod.UUID,
    campaign_id: str | None,
    user_id: str,
):
    """If a campaignId is provided, add the journalist to the campaign's default list."""
    if not campaign_id:
        return
    campaign_uuid = uuid_mod.UUID(campaign_id)
    # Find or create a default list for this campaign
    result = await session.execute(
        select(List).where(List.campaign_id == campaign_uuid).limit(1)
    )
    lst = result.scalar_one_or_none()
    if not lst:
        lst = List(
            name="Extension imports",
            campaign_id=campaign_uuid,
            owner_id=uuid_mod.UUID(user_id),
        )
        session.add(lst)
        await session.flush()

    # Add journalist to list (ignore if already there)
    existing = await session.execute(
        select(ListJournalist).where(
            ListJournalist.list_id == lst.id,
            ListJournalist.journalist_id == journalist_id,
        )
    )
    if not existing.scalar_one_or_none():
        session.add(ListJournalist(list_id=lst.id, journalist_id=journalist_id))


def _parse_name(full_name: str) -> tuple[str, str]:
    """Split a full name into first_name and last_name."""
    parts = full_name.strip().split(None, 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return full_name.strip(), ""


def _extract_job_and_media(headline: str) -> tuple[str, str]:
    """Try to extract job title and media from LinkedIn headline.

    Common patterns: "Journaliste chez Le Monde", "Rédacteur en chef | Libération"
    """
    for sep in [" chez ", " at ", " | ", " - ", " — "]:
        if sep in headline:
            parts = headline.split(sep, 1)
            return parts[0].strip(), parts[1].strip()
    return headline.strip(), ""


def _extract_name_from_linkedin_url(url: str) -> tuple[str, str]:
    """Extract a probable first/last name from a LinkedIn profile URL slug.

    Examples:
        /in/julie-moreau-123abc → ("Julie", "Moreau")
        /in/jean-pierre-dupont  → ("Jean-Pierre", "Dupont")
        /in/some-slug           → ("Some", "Slug")
    Returns ("", "") if extraction fails.
    """
    match = re.search(r"linkedin\.com/in/([^/?#]+)", url)
    if not match:
        return "", ""
    slug = match.group(1).rstrip("/")
    # Remove trailing hex/numeric ID suffixes (e.g. "-1a2b3c4d", "-123456789")
    slug = re.sub(r"-[0-9a-f]{6,}$", "", slug)
    slug = re.sub(r"-\d{3,}$", "", slug)
    parts = slug.split("-")
    if len(parts) < 2:
        return parts[0].capitalize(), ""
    # Heuristic: first part = first name, rest = last name
    # Handle compound first names (jean-pierre → keep hyphen)
    first_name = parts[0].capitalize()
    last_name = " ".join(p.capitalize() for p in parts[1:])
    return first_name, last_name


async def _create_journalist_from_profile(
    profile, user_id: str, session: AsyncSession, tags: list[str] | None = None
) -> Journalist:
    """Create or update a journalist from extension profile data."""
    # Check if journalist already exists by LinkedIn URL
    if profile.linkedinUrl:
        result = await session.execute(
            select(Journalist).where(Journalist.linkedin_url == profile.linkedinUrl)
        )
        existing = result.scalar_one_or_none()
        if existing:
            # Update existing journalist with fresh data
            first_name, last_name = _parse_name(profile.name)
            if first_name:
                existing.first_name = first_name
            if last_name:
                existing.last_name = last_name
            if profile.headline:
                job_title, media_name = _extract_job_and_media(profile.headline)
                if job_title:
                    existing.job_title = job_title
                if media_name:
                    existing.media_name = media_name
            if profile.location:
                existing.city = profile.location
            existing.updated_at = datetime.now(timezone.utc)
            return existing

    first_name, last_name = _parse_name(profile.name)
    job_title, media_name = _extract_job_and_media(profile.headline)

    # Use currentCompany as media if not extracted from headline
    if not media_name and profile.currentCompany:
        media_name = profile.currentCompany

    journalist = Journalist(
        first_name=first_name,
        last_name=last_name,
        job_title=job_title or profile.headline,
        media_name=media_name,
        linkedin_url=profile.linkedinUrl or None,
        city=profile.location or None,
        source="chrome_extension",
        tags_micro=tags if tags else None,
        owner_id=uuid_mod.UUID(user_id),
    )
    session.add(journalist)
    return journalist


@router.post("/journalists/from-profile", response_model=JournalistRead, status_code=201)
async def create_from_profile(
    body: ExtensionProfileSubmit,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Create a journalist from a LinkedIn profile captured by the extension."""
    journalist = await _create_journalist_from_profile(
        body.profile, user["id"], session, body.tags
    )
    await session.flush()
    await _add_to_campaign_list(session, journalist.id, body.campaignId, user["id"])
    await session.commit()
    await session.refresh(journalist)

    # Trigger background enrichment
    if not os.environ.get("TESTING"):
        try:
            from app.tasks import enrich_journalist
            enrich_journalist.delay(str(journalist.id))
        except Exception:
            pass

    return journalist


@router.post("/journalists/from-bulk", status_code=201)
async def create_from_bulk(
    body: ExtensionBulkSubmit,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Create multiple journalists from bulk LinkedIn capture."""
    created = []
    for profile in body.profiles:
        journalist = await _create_journalist_from_profile(
            profile, user["id"], session, body.tags
        )
        created.append(journalist)

    await session.flush()
    for j in created:
        await _add_to_campaign_list(session, j.id, body.campaignId, user["id"])
    await session.commit()

    # Refresh and trigger enrichment
    result_ids = []
    for j in created:
        await session.refresh(j)
        result_ids.append(str(j.id))
        if not os.environ.get("TESTING"):
            try:
                from app.tasks import enrich_journalist
                enrich_journalist.delay(str(j.id))
            except Exception:
                pass

    return {
        "created": len(result_ids),
        "journalist_ids": result_ids,
    }


@router.post("/journalists/from-url", response_model=JournalistRead, status_code=201)
async def create_from_url(
    body: ExtensionUrlImport,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Degraded mode — create a journalist from a LinkedIn URL only.

    The journalist is created with minimal data (just the URL) and
    enriched via Dropcontact + article search in the background.
    """
    if not body.linkedin_url or "linkedin.com" not in body.linkedin_url:
        raise HTTPException(status_code=400, detail="URL LinkedIn invalide")

    # Check if already exists
    result = await session.execute(
        select(Journalist).where(Journalist.linkedin_url == body.linkedin_url)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    # Extract name from LinkedIn URL slug for initial data
    first_name, last_name = _extract_name_from_linkedin_url(body.linkedin_url)

    journalist = Journalist(
        first_name=first_name or None,
        last_name=last_name or None,
        linkedin_url=body.linkedin_url,
        source="chrome_extension",
        tags_micro=body.tags if body.tags else None,
        owner_id=uuid_mod.UUID(user["id"]),
    )
    session.add(journalist)
    await session.flush()
    await _add_to_campaign_list(session, journalist.id, body.campaignId, user["id"])
    await session.commit()
    await session.refresh(journalist)

    # Trigger enrichment (Dropcontact will try to resolve name/email from URL)
    if not os.environ.get("TESTING"):
        try:
            from app.tasks import enrich_journalist
            enrich_journalist.delay(str(journalist.id))
        except Exception:
            pass

    return journalist
