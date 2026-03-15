import uuid as uuid_mod
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_session
from app.models.campaign import Campaign
from app.schemas import CampaignCreate, CampaignRead, CampaignUpdate

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("/", response_model=list[CampaignRead])
async def list_campaigns(
    client_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    query = select(Campaign).order_by(Campaign.created_at.desc())
    if client_id:
        query = query.where(Campaign.client_id == client_id)
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/", response_model=CampaignRead, status_code=201)
async def create_campaign(
    data: CampaignCreate,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    campaign = Campaign(**data.model_dump(), owner_id=uuid_mod.UUID(user["id"]))
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)
    return campaign


@router.get("/{campaign_id}", response_model=CampaignRead)
async def get_campaign(
    campaign_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.put("/{campaign_id}", response_model=CampaignRead)
async def update_campaign(
    campaign_id: UUID,
    data: CampaignUpdate,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(campaign, field, value)
    await session.commit()
    await session.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await session.delete(campaign)
    await session.commit()
