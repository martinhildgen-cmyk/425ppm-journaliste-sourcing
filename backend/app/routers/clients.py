from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_user_uuid
from app.database import get_session
from app.models.campaign import Campaign
from app.models.client import Client
from app.schemas import ClientCreate, ClientRead, ClientUpdate

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/", response_model=list[ClientRead])
async def list_clients(
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Client).order_by(Client.created_at.desc()))
    return result.scalars().all()


@router.get("/with-counts")
async def list_clients_with_counts(
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    """List clients with campaign counts in a single query (avoids N+1)."""
    stmt = (
        select(Client, func.count(Campaign.id).label("campaign_count"))
        .outerjoin(Campaign, Campaign.client_id == Client.id)
        .group_by(Client.id)
        .order_by(Client.created_at.desc())
    )
    result = await session.execute(stmt)
    rows = result.all()
    return [
        {
            "id": str(client.id),
            "name": client.name,
            "sector": client.sector,
            "description": client.description,
            "keywords": client.keywords,
            "owner_id": str(client.owner_id) if client.owner_id else None,
            "created_at": client.created_at.isoformat() if client.created_at else None,
            "updated_at": client.updated_at.isoformat() if client.updated_at else None,
            "campaign_count": count,
        }
        for client, count in rows
    ]


@router.post("/", response_model=ClientRead, status_code=201)
async def create_client(
    data: ClientCreate,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    client = Client(**data.model_dump(), owner_id=get_user_uuid(user))
    session.add(client)
    await session.commit()
    await session.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientRead)
async def get_client(
    client_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.put("/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: UUID,
    data: ClientUpdate,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    await session.commit()
    await session.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await session.delete(client)
    await session.commit()
