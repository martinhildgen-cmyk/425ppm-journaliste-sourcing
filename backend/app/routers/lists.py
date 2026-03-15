from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/lists", tags=["lists"])


@router.get("/")
async def list_lists() -> dict:
    return {"message": "not implemented"}


@router.post("/")
async def create_list() -> dict:
    return {"message": "not implemented"}


@router.get("/{list_id}")
async def get_list(list_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.put("/{list_id}")
async def update_list(list_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.delete("/{list_id}")
async def delete_list(list_id: UUID) -> dict:
    return {"message": "not implemented"}
