import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_notes_crud(client: AsyncClient, auth_headers: dict):
    # Create journalist
    j_resp = await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont"},
        headers=auth_headers,
    )
    journalist_id = j_resp.json()["id"]

    # Create note
    resp = await client.post(
        f"/journalists/{journalist_id}/notes/",
        json={"body": "Contact préféré pour les sujets climat."},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    note_id = resp.json()["id"]
    assert resp.json()["body"] == "Contact préféré pour les sujets climat."

    # List notes
    resp = await client.get(
        f"/journalists/{journalist_id}/notes/", headers=auth_headers
    )
    assert len(resp.json()) == 1

    # Delete note
    resp = await client.delete(
        f"/journalists/{journalist_id}/notes/{note_id}", headers=auth_headers
    )
    assert resp.status_code == 204
