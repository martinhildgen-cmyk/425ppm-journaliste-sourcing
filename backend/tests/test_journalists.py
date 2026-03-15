import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_journalist(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/journalists/",
        json={
            "first_name": "Marie",
            "last_name": "Dupont",
            "job_title": "Rédactrice en chef",
            "media_name": "Le Monde",
            "media_type": "presse_ecrite",
            "media_scope": "pqn",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["first_name"] == "Marie"
    assert data["last_name"] == "Dupont"
    assert data["media_name"] == "Le Monde"
    assert data["email_status"] == "manquant"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_journalists(client: AsyncClient, auth_headers: dict):
    # Create two journalists
    await client.post(
        "/journalists/",
        json={"first_name": "Alice", "last_name": "Martin", "media_name": "Libération"},
        headers=auth_headers,
    )
    await client.post(
        "/journalists/",
        json={"first_name": "Bob", "last_name": "Durand", "media_name": "Le Figaro"},
        headers=auth_headers,
    )

    resp = await client.get("/journalists/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_search_journalists(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont", "media_name": "Le Monde"},
        headers=auth_headers,
    )
    await client.post(
        "/journalists/",
        json={"first_name": "Jean", "last_name": "Martin", "media_name": "Libération"},
        headers=auth_headers,
    )

    # Search by name
    resp = await client.get("/journalists/?search=Marie", headers=auth_headers)
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["first_name"] == "Marie"

    # Search by media
    resp = await client.get("/journalists/?media_name=Monde", headers=auth_headers)
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_get_journalist(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont"},
        headers=auth_headers,
    )
    journalist_id = create_resp.json()["id"]

    resp = await client.get(f"/journalists/{journalist_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "Marie"


@pytest.mark.asyncio
async def test_get_journalist_not_found(client: AsyncClient, auth_headers: dict):
    import uuid

    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/journalists/{fake_id}", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_journalist(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont", "job_title": "Journaliste"},
        headers=auth_headers,
    )
    journalist_id = create_resp.json()["id"]

    resp = await client.put(
        f"/journalists/{journalist_id}",
        json={"job_title": "Rédactrice en chef", "media_name": "Le Monde"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_title"] == "Rédactrice en chef"
    assert data["job_title_previous"] == "Journaliste"
    assert data["media_name"] == "Le Monde"


@pytest.mark.asyncio
async def test_delete_journalist(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(
        "/journalists/",
        json={"first_name": "Marie", "last_name": "Dupont"},
        headers=auth_headers,
    )
    journalist_id = create_resp.json()["id"]

    resp = await client.delete(f"/journalists/{journalist_id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get(f"/journalists/{journalist_id}", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_request(client: AsyncClient):
    resp = await client.get("/journalists/")
    assert resp.status_code == 403
