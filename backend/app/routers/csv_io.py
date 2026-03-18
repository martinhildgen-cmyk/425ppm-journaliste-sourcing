"""CSV import and HubSpot-ready export endpoints."""

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, get_user_uuid
from app.database import get_session
from app.models.journalist import Journalist
from app.models.list import List
from app.models.pitch_match import PitchMatch

router = APIRouter(tags=["csv"])


@router.get("/import/template")
async def download_csv_template():
    """Download an empty CSV template with the expected column headers."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "prenom",
            "nom",
            "email",
            "poste",
            "media",
            "media_type",
            "media_scope",
            "linkedin",
            "twitter",
            "ville",
            "pays",
        ]
    )
    writer.writerow(
        [
            "Marie",
            "Dupont",
            "marie.dupont@lemonde.fr",
            "Redactrice en chef",
            "Le Monde",
            "presse_ecrite",
            "national",
            "https://linkedin.com/in/marie-dupont",
            "",
            "Paris",
            "France",
        ]
    )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=template_journalistes.csv"},
    )


# ── CSV Import ──────────────────────────────────────────────────────────────

# Mapping from CSV header variants → model field name
IMPORT_FIELD_MAP = {
    "first_name": "first_name",
    "prénom": "first_name",
    "prenom": "first_name",
    "last_name": "last_name",
    "nom": "last_name",
    "job_title": "job_title",
    "titre": "job_title",
    "poste": "job_title",
    "email": "email",
    "linkedin_url": "linkedin_url",
    "linkedin": "linkedin_url",
    "twitter_url": "twitter_url",
    "twitter": "twitter_url",
    "city": "city",
    "ville": "city",
    "country": "country",
    "pays": "country",
    "media_name": "media_name",
    "média": "media_name",
    "media": "media_name",
    "media_type": "media_type",
    "type_média": "media_type",
    "media_scope": "media_scope",
    "portée": "media_scope",
    "portee": "media_scope",
}

ALLOWED_FIELDS = {
    "first_name",
    "last_name",
    "job_title",
    "email",
    "linkedin_url",
    "twitter_url",
    "city",
    "country",
    "media_name",
    "media_type",
    "media_scope",
}


@router.post("/import/journalists")
async def import_csv(
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Import journalists from a CSV file. Skips duplicates by linkedin_url or email."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Empty or invalid CSV")

    # Normalize headers
    header_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        normalized = raw_header.strip().lower().replace(" ", "_")
        if normalized in IMPORT_FIELD_MAP:
            header_map[raw_header] = IMPORT_FIELD_MAP[normalized]

    created = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        try:
            data: dict[str, str | None] = {}
            for raw_header, field_name in header_map.items():
                val = row.get(raw_header, "").strip()
                if val and field_name in ALLOWED_FIELDS:
                    data[field_name] = val

            if not data.get("first_name") and not data.get("last_name") and not data.get("email"):
                skipped += 1
                continue

            # Check duplicate by linkedin_url or email
            if data.get("linkedin_url"):
                existing = await session.execute(
                    select(Journalist).where(Journalist.linkedin_url == data["linkedin_url"])
                )
                if existing.scalar_one_or_none():
                    skipped += 1
                    continue

            if data.get("email"):
                existing = await session.execute(
                    select(Journalist).where(Journalist.email == data["email"])
                )
                if existing.scalar_one_or_none():
                    skipped += 1
                    continue

            journalist = Journalist(
                **data,
                source="csv_import",
                owner_id=get_user_uuid(user),
            )
            session.add(journalist)
            created += 1

        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")

    await session.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


# ── CSV Export (HubSpot-ready) ──────────────────────────────────────────────

# HubSpot expected headers (section 8 du PRD)
HUBSPOT_HEADERS = [
    "First Name",
    "Last Name",
    "Email",
    "Job Title",
    "Company Name",
    "Media Type",
    "Media Scope",
    "LinkedIn",
    "Twitter",
    "City",
    "Country",
    "Sector",
    "Tags",
    "AI Summary",
    "AI Tonality",
    "Pitch Advice",
    "Email Status",
    "Source",
]


def _journalist_to_hubspot_row(j: Journalist, pitch_advice: str = "") -> dict[str, str]:
    return {
        "First Name": j.first_name or "",
        "Last Name": j.last_name or "",
        "Email": j.email or "",
        "Job Title": j.job_title or "",
        "Company Name": j.media_name or "",
        "Media Type": j.media_type or "",
        "Media Scope": j.media_scope or "",
        "LinkedIn": j.linkedin_url or "",
        "Twitter": j.twitter_url or "",
        "City": j.city or "",
        "Country": j.country or "",
        "Sector": j.sector_macro or "",
        "Tags": ";".join(j.tags_micro) if j.tags_micro else "",
        "AI Summary": j.ai_summary or "",
        "AI Tonality": j.ai_tonality or "",
        "Pitch Advice": pitch_advice,
        "Email Status": j.email_status or "",
        "Source": j.source or "",
    }


@router.get("/export/journalists")
async def export_journalists_csv(
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Export all journalists as a HubSpot-ready CSV."""
    result = await session.execute(select(Journalist).order_by(Journalist.last_name))
    journalists = result.scalars().all()

    # Load latest pitch advice per journalist
    pitch_map: dict[str, str] = {}
    for j in journalists:
        pm_result = await session.execute(
            select(PitchMatch.pitch_advice)
            .where(PitchMatch.journalist_id == j.id)
            .order_by(PitchMatch.created_at.desc())
            .limit(1)
        )
        advice = pm_result.scalar_one_or_none()
        if advice:
            pitch_map[str(j.id)] = advice

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=HUBSPOT_HEADERS)
    writer.writeheader()
    for j in journalists:
        writer.writerow(_journalist_to_hubspot_row(j, pitch_map.get(str(j.id), "")))

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=journalistes_hubspot.csv"},
    )


@router.get("/export/lists/{list_id}")
async def export_list_csv(
    list_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Export a specific list's journalists as a HubSpot-ready CSV."""
    result = await session.execute(
        select(List).where(List.id == list_id).options(selectinload(List.journalists))
    )
    lst = result.scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")

    # Load latest pitch advice per journalist
    pitch_map: dict[str, str] = {}
    for j in lst.journalists:
        pm_result = await session.execute(
            select(PitchMatch.pitch_advice)
            .where(PitchMatch.journalist_id == j.id)
            .order_by(PitchMatch.created_at.desc())
            .limit(1)
        )
        advice = pm_result.scalar_one_or_none()
        if advice:
            pitch_map[str(j.id)] = advice

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=HUBSPOT_HEADERS)
    writer.writeheader()
    for j in lst.journalists:
        writer.writerow(_journalist_to_hubspot_row(j, pitch_map.get(str(j.id), "")))

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=liste_{lst.name.replace(' ', '_')}.csv"
        },
    )
