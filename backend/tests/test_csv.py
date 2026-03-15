import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_csv_import(client: AsyncClient, auth_headers: dict):
    csv_content = (
        "Prénom,Nom,Email,Poste,Média,LinkedIn\n"
        "Marie,Dupont,marie@lemonde.fr,Journaliste,Le Monde,https://linkedin.com/in/marie\n"
        "Jean,Martin,jean@liberation.fr,Rédacteur,Libération,https://linkedin.com/in/jean\n"
    )
    resp = await client.post(
        "/import/journalists",
        files={"file": ("contacts.csv", csv_content.encode(), "text/csv")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert data["skipped"] == 0

    # Verify they exist
    resp = await client.get("/journalists/", headers=auth_headers)
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_csv_import_skips_duplicates(client: AsyncClient, auth_headers: dict):
    csv_content = (
        "first_name,last_name,email\n"
        "Marie,Dupont,marie@lemonde.fr\n"
    )
    # Import once
    await client.post(
        "/import/journalists",
        files={"file": ("c.csv", csv_content.encode(), "text/csv")},
        headers=auth_headers,
    )
    # Import same again
    resp = await client.post(
        "/import/journalists",
        files={"file": ("c.csv", csv_content.encode(), "text/csv")},
        headers=auth_headers,
    )
    data = resp.json()
    assert data["created"] == 0
    assert data["skipped"] == 1


@pytest.mark.asyncio
async def test_csv_export_hubspot(client: AsyncClient, auth_headers: dict):
    # Create a journalist
    await client.post(
        "/journalists/",
        json={
            "first_name": "Marie",
            "last_name": "Dupont",
            "email": "marie@lemonde.fr",
            "media_name": "Le Monde",
        },
        headers=auth_headers,
    )

    resp = await client.get("/export/journalists", headers=auth_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    content = resp.text
    assert "First Name" in content
    assert "Marie" in content
    assert "Le Monde" in content


@pytest.mark.asyncio
async def test_list_export_csv(client: AsyncClient, auth_headers: dict):
    # Create client + campaign + list
    c = await client.post("/clients/", json={"name": "Test"}, headers=auth_headers)
    camp = await client.post(
        "/campaigns/",
        json={"name": "Camp", "client_id": c.json()["id"]},
        headers=auth_headers,
    )
    lst = await client.post(
        "/lists/",
        json={"name": "Ma Liste", "campaign_id": camp.json()["id"]},
        headers=auth_headers,
    )
    list_id = lst.json()["id"]

    # Create journalist and add to list
    j = await client.post(
        "/journalists/",
        json={"first_name": "Bob", "last_name": "Climat"},
        headers=auth_headers,
    )
    await client.post(
        f"/lists/{list_id}/journalists",
        json={"journalist_ids": [j.json()["id"]]},
        headers=auth_headers,
    )

    resp = await client.get(f"/export/lists/{list_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert "Bob" in resp.text
