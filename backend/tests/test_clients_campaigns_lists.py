import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_client_crud(client: AsyncClient, auth_headers: dict):
    # Create
    resp = await client.post(
        "/clients/",
        json={"name": "TotalEnergies", "sector": "Énergie"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    client_id = resp.json()["id"]

    # Read
    resp = await client.get(f"/clients/{client_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "TotalEnergies"

    # Update
    resp = await client.put(
        f"/clients/{client_id}",
        json={"name": "TotalEnergies SE"},
        headers=auth_headers,
    )
    assert resp.json()["name"] == "TotalEnergies SE"

    # List
    resp = await client.get("/clients/", headers=auth_headers)
    assert len(resp.json()) == 1

    # Delete
    resp = await client.delete(f"/clients/{client_id}", headers=auth_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_campaign_crud(client: AsyncClient, auth_headers: dict):
    # Create client first
    c_resp = await client.post(
        "/clients/", json={"name": "LVMH"}, headers=auth_headers
    )
    client_id = c_resp.json()["id"]

    # Create campaign
    resp = await client.post(
        "/campaigns/",
        json={"name": "Lancement Parfum", "client_id": client_id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    campaign_id = resp.json()["id"]
    assert resp.json()["status"] == "draft"

    # List by client
    resp = await client.get(f"/campaigns/?client_id={client_id}", headers=auth_headers)
    assert len(resp.json()) == 1

    # Update
    resp = await client.put(
        f"/campaigns/{campaign_id}",
        json={"status": "active"},
        headers=auth_headers,
    )
    assert resp.json()["status"] == "active"

    # Delete
    resp = await client.delete(f"/campaigns/{campaign_id}", headers=auth_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_list_crud_with_journalists(client: AsyncClient, auth_headers: dict):
    # Create client + campaign
    c_resp = await client.post(
        "/clients/", json={"name": "Danone"}, headers=auth_headers
    )
    client_id = c_resp.json()["id"]

    camp_resp = await client.post(
        "/campaigns/",
        json={"name": "RSE 2026", "client_id": client_id},
        headers=auth_headers,
    )
    campaign_id = camp_resp.json()["id"]

    # Create list
    resp = await client.post(
        "/lists/",
        json={"name": "Journalistes Environnement", "campaign_id": campaign_id},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    list_id = resp.json()["id"]

    # Create journalists
    j1 = await client.post(
        "/journalists/",
        json={"first_name": "Alice", "last_name": "Eco"},
        headers=auth_headers,
    )
    j2 = await client.post(
        "/journalists/",
        json={"first_name": "Bob", "last_name": "Climat"},
        headers=auth_headers,
    )
    j1_id = j1.json()["id"]
    j2_id = j2.json()["id"]

    # Add journalists to list
    resp = await client.post(
        f"/lists/{list_id}/journalists",
        json={"journalist_ids": [j1_id, j2_id]},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["added"] == 2

    # Get list with journalists
    resp = await client.get(f"/lists/{list_id}", headers=auth_headers)
    assert len(resp.json()["journalists"]) == 2

    # Remove journalist
    resp = await client.delete(
        f"/lists/{list_id}/journalists/{j1_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    # Verify
    resp = await client.get(f"/lists/{list_id}", headers=auth_headers)
    assert len(resp.json()["journalists"]) == 1
