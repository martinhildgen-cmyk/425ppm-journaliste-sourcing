from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("/")
async def list_campaigns() -> dict:
    return {"message": "not implemented"}


@router.post("/")
async def create_campaign() -> dict:
    return {"message": "not implemented"}


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.put("/{campaign_id}")
async def update_campaign(campaign_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: UUID) -> dict:
    return {"message": "not implemented"}
