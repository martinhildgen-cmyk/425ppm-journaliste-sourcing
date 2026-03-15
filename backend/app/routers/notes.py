import uuid as uuid_mod
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_session
from app.models.journalist import Journalist
from app.models.note import Note
from app.schemas import NoteCreate, NoteRead
from app.services.audit import log_action

router = APIRouter(prefix="/journalists/{journalist_id}/notes", tags=["notes"])


@router.get("/", response_model=list[NoteRead])
async def list_notes(
    journalist_id: UUID,
    session: AsyncSession = Depends(get_session),
    _user: dict = Depends(get_current_user),
):
    result = await session.execute(
        select(Note)
        .where(Note.journalist_id == journalist_id)
        .order_by(Note.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=NoteRead, status_code=201)
async def create_note(
    journalist_id: UUID,
    data: NoteCreate,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    # Verify journalist exists
    j_result = await session.execute(
        select(Journalist).where(Journalist.id == journalist_id)
    )
    if not j_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Journalist not found")

    note = Note(journalist_id=journalist_id, author_id=uuid_mod.UUID(user["id"]), body=data.body)
    session.add(note)
    await log_action(
        session,
        user_id=user["id"],
        action="create_note",
        entity_type="journalist",
        entity_id=str(journalist_id),
    )
    await session.commit()
    await session.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    journalist_id: UUID,
    note_id: UUID,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(get_current_user),
):
    result = await session.execute(
        select(Note).where(Note.id == note_id, Note.journalist_id == journalist_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    # Only author or admin can delete
    if str(note.author_id) != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")
    await log_action(
        session,
        user_id=user["id"],
        action="delete_note",
        entity_type="journalist",
        entity_id=str(journalist_id),
    )
    await session.delete(note)
    await session.commit()
