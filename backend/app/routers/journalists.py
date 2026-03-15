from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/journalists", tags=["journalists"])


@router.get("/")
async def list_journalists() -> dict:
    return {"message": "not implemented"}


@router.post("/")
async def create_journalist() -> dict:
    return {"message": "not implemented"}


@router.get("/{journalist_id}")
async def get_journalist(journalist_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.put("/{journalist_id}")
async def update_journalist(journalist_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.delete("/{journalist_id}")
async def delete_journalist(journalist_id: UUID) -> dict:
    return {"message": "not implemented"}
