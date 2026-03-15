import uuid as uuid_mod
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_session
from app.models.journalist import Journalist
from app.models.list import List, ListJournalist
from app.schemas import ListAddJournalists, ListCreate, ListDetailRead, ListRead, ListUpdate

router = APIRouter(prefix="/lists", tags=["lists"])


@router.get("/", response_model=list[ListRead])
async def list_lists(
    campaign_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    query = select(List).order_by(List.created_at.desc())
    if campaign_id:
        query = query.where(List.campaign_id == campaign_id)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/", response_model=ListRead, status_code=201)
async def create_list(
    data: ListCreate,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    lst = List(**data.model_dump(), owner_id=uuid_mod.UUID(user["id"]))
    session.add(lst)
    await session.commit()
    await session.refresh(lst)
    return lst


@router.get("/{list_id}", response_model=ListDetailRead)
async def get_list(
    list_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(
        select(List).where(List.id == list_id).options(selectinload(List.journalists))
    )
    lst = result.scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    return lst


@router.put("/{list_id}", response_model=ListRead)
async def update_list(
    list_id: UUID,
    data: ListUpdate,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(List).where(List.id == list_id))
    lst = result.scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lst, field, value)
    await session.commit()
    await session.refresh(lst)
    return lst


@router.delete("/{list_id}", status_code=204)
async def delete_list(
    list_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(List).where(List.id == list_id))
    lst = result.scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    await session.delete(lst)
    await session.commit()


@router.post("/{list_id}/journalists", status_code=201)
async def add_journalists_to_list(
    list_id: UUID,
    data: ListAddJournalists,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Add journalists to a list (N:N)."""
    # Verify list exists
    result = await session.execute(select(List).where(List.id == list_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="List not found")

    added = 0
    for jid in data.journalist_ids:
        # Verify journalist exists
        j_result = await session.execute(select(Journalist).where(Journalist.id == jid))
        if not j_result.scalar_one_or_none():
            continue
        # Check not already in list
        existing = await session.execute(
            select(ListJournalist).where(
                ListJournalist.list_id == list_id,
                ListJournalist.journalist_id == jid,
            )
        )
        if existing.scalar_one_or_none():
            continue
        session.add(ListJournalist(list_id=list_id, journalist_id=jid))
        added += 1

    await session.commit()
    return {"added": added}


@router.delete("/{list_id}/journalists/{journalist_id}", status_code=204)
async def remove_journalist_from_list(
    list_id: UUID,
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """Remove a journalist from a list."""
    result = await session.execute(
        select(ListJournalist).where(
            ListJournalist.list_id == list_id,
            ListJournalist.journalist_id == journalist_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journalist not in list")
    await session.delete(entry)
    await session.commit()
