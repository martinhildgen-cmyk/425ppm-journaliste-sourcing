from datetime import datetime, timezone
from uuid import UUID

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_user_uuid
from app.database import get_session
from app.models.journalist import Journalist
from app.schemas import (
    JournalistCreate,
    JournalistListResponse,
    JournalistRead,
    JournalistUpdate,
)
from app.services.audit import log_action

router = APIRouter(prefix="/journalists", tags=["journalists"])


@router.get("/", response_model=JournalistListResponse)
async def list_journalists(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    media_name: str | None = None,
    media_type: str | None = None,
    media_scope: str | None = None,
    sector_macro: str | None = None,
    tags: str | None = None,
    is_watched: bool | None = None,
    movement_alert: bool | None = None,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """List journalists with filtering and pagination."""
    query = select(Journalist)
    count_query = select(func.count()).select_from(Journalist)

    # Filters
    if search:
        pattern = f"%{search}%"
        search_filter = (
            Journalist.first_name.ilike(pattern)
            | Journalist.last_name.ilike(pattern)
            | Journalist.media_name.ilike(pattern)
            | Journalist.email.ilike(pattern)
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    if media_name:
        query = query.where(Journalist.media_name.ilike(f"%{media_name}%"))
        count_query = count_query.where(Journalist.media_name.ilike(f"%{media_name}%"))
    if media_type:
        query = query.where(Journalist.media_type == media_type)
        count_query = count_query.where(Journalist.media_type == media_type)
    if media_scope:
        query = query.where(Journalist.media_scope == media_scope)
        count_query = count_query.where(Journalist.media_scope == media_scope)
    if sector_macro:
        query = query.where(Journalist.sector_macro == sector_macro)
        count_query = count_query.where(Journalist.sector_macro == sector_macro)
    if tags:
        # Filter by tags_micro — supports comma-separated tags (AND logic)
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        for tag in tag_list:
            tag_filter = Journalist.tags_micro.any(tag)
            query = query.where(tag_filter)
            count_query = count_query.where(tag_filter)
    if is_watched is not None:
        query = query.where(Journalist.is_watched == is_watched)
        count_query = count_query.where(Journalist.is_watched == is_watched)
    if movement_alert is not None:
        query = query.where(Journalist.movement_alert == movement_alert)
        count_query = count_query.where(Journalist.movement_alert == movement_alert)

    total = (await session.execute(count_query)).scalar_one()

    query = query.order_by(Journalist.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    journalists = result.scalars().all()

    return JournalistListResponse(
        items=journalists,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/", response_model=JournalistRead, status_code=201)
async def create_journalist(
    data: JournalistCreate,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    """Create a new journalist. Triggers background enrichment if possible."""
    journalist = Journalist(**data.model_dump(exclude_unset=True), owner_id=get_user_uuid(user))
    session.add(journalist)
    await session.commit()
    await session.refresh(journalist)

    await log_action(
        session,
        user_id=user["id"],
        action="create",
        entity_type="journalist",
        entity_id=str(journalist.id),
        details={"first_name": journalist.first_name, "last_name": journalist.last_name},
    )
    await session.commit()

    # Trigger background enrichment (non-blocking, fails silently)

    if not os.environ.get("TESTING"):
        try:
            from app.tasks import enrich_journalist

            enrich_journalist.delay(str(journalist.id))
        except Exception:
            pass  # Celery not available — skip silently

    return journalist


@router.get("/{journalist_id}", response_model=JournalistRead)
async def get_journalist(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Get a single journalist by ID. Updates last_accessed_at for RGPD tracking."""
    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    journalist = result.scalar_one_or_none()
    if not journalist:
        raise HTTPException(status_code=404, detail="Journalist not found")

    journalist.last_accessed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(journalist)
    return journalist


@router.put("/{journalist_id}", response_model=JournalistRead)
async def update_journalist(
    journalist_id: UUID,
    data: JournalistUpdate,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Update a journalist."""
    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    journalist = result.scalar_one_or_none()
    if not journalist:
        raise HTTPException(status_code=404, detail="Journalist not found")

    update_data = data.model_dump(exclude_unset=True)

    # Track job title changes for movement detection
    if "job_title" in update_data and update_data["job_title"] != journalist.job_title:
        journalist.job_title_previous = journalist.job_title
        journalist.job_last_updated_at = datetime.now(timezone.utc)

    # Track media changes
    if "media_name" in update_data and update_data["media_name"] != journalist.media_name:
        journalist.media_name_previous = journalist.media_name

    for field, value in update_data.items():
        setattr(journalist, field, value)

    journalist.updated_at = datetime.now(timezone.utc)

    await log_action(
        session,
        user_id=_user["id"],
        action="update",
        entity_type="journalist",
        entity_id=str(journalist.id),
        details={"fields": list(update_data.keys())},
    )
    await session.commit()
    await session.refresh(journalist)
    return journalist


@router.delete("/{journalist_id}", status_code=204)
async def delete_journalist(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Delete a journalist (RGPD: droit à l'oubli)."""
    from sqlalchemy import delete as sa_delete

    from app.models.content import Content
    from app.models.list import ListJournalist
    from app.models.note import Note
    from app.models.pitch_match import PitchMatch

    result = await session.execute(select(Journalist).where(Journalist.id == journalist_id))
    journalist = result.scalar_one_or_none()
    if not journalist:
        raise HTTPException(status_code=404, detail="Journalist not found")

    # Delete related records manually (production DB may lack CASCADE constraints)
    await session.execute(sa_delete(Content).where(Content.journalist_id == journalist_id))
    await session.execute(sa_delete(Note).where(Note.journalist_id == journalist_id))
    await session.execute(sa_delete(PitchMatch).where(PitchMatch.journalist_id == journalist_id))
    await session.execute(
        sa_delete(ListJournalist).where(ListJournalist.journalist_id == journalist_id)
    )

    await session.delete(journalist)
    await session.commit()
