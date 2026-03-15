from uuid import UUID

from fastapi import APIRouter

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/")
async def list_clients() -> dict:
    return {"message": "not implemented"}


@router.post("/")
async def create_client() -> dict:
    return {"message": "not implemented"}


@router.get("/{client_id}")
async def get_client(client_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.put("/{client_id}")
async def update_client(client_id: UUID) -> dict:
    return {"message": "not implemented"}


@router.delete("/{client_id}")
async def delete_client(client_id: UUID) -> dict:
    return {"message": "not implemented"}
