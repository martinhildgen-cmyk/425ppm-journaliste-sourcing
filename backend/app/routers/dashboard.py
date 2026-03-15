"""Dashboard Router — stats, movement alerts feed, and global search."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_session
from app.models.journalist import Journalist

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Return dashboard statistics: totals, alerts, watched count."""
    total = (
        await session.execute(select(func.count()).select_from(Journalist))
    ).scalar_one()

    alerts = (
        await session.execute(
            select(func.count())
            .select_from(Journalist)
            .where(Journalist.movement_alert == True)  # noqa: E712
        )
    ).scalar_one()

    watched = (
        await session.execute(
            select(func.count())
            .select_from(Journalist)
            .where(Journalist.is_watched == True)  # noqa: E712
        )
    ).scalar_one()

    analyzed = (
        await session.execute(
            select(func.count())
            .select_from(Journalist)
            .where(Journalist.ai_last_analyzed_at.isnot(None))
        )
    ).scalar_one()

    email_valid = (
        await session.execute(
            select(func.count())
            .select_from(Journalist)
            .where(Journalist.email_status == "valide")
        )
    ).scalar_one()

    return {
        "total_journalists": total,
        "movement_alerts": alerts,
        "watched_journalists": watched,
        "ai_analyzed": analyzed,
        "email_valid": email_valid,
    }


@router.get("/alerts")
async def get_movement_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Return journalists with active movement alerts."""
    count_query = (
        select(func.count())
        .select_from(Journalist)
        .where(Journalist.movement_alert == True)  # noqa: E712
    )
    total = (await session.execute(count_query)).scalar_one()

    query = (
        select(Journalist)
        .where(Journalist.movement_alert == True)  # noqa: E712
        .order_by(Journalist.job_last_updated_at.desc().nullslast())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.execute(query)
    journalists = result.scalars().all()

    return {
        "items": [
            {
                "id": str(j.id),
                "first_name": j.first_name,
                "last_name": j.last_name,
                "job_title": j.job_title,
                "job_title_previous": j.job_title_previous,
                "media_name": j.media_name,
                "media_name_previous": j.media_name_previous,
                "job_last_updated_at": j.job_last_updated_at.isoformat() if j.job_last_updated_at else None,
            }
            for j in journalists
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/alerts/{journalist_id}/dismiss")
async def dismiss_alert(
    journalist_id: str,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Dismiss a movement alert for a journalist."""
    from uuid import UUID

    result = await session.execute(
        select(Journalist).where(Journalist.id == UUID(journalist_id))
    )
    journalist = result.scalar_one_or_none()
    if not journalist:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Journalist not found")

    journalist.movement_alert = False
    await session.commit()
    return {"dismissed": True}
