import pytest


@pytest.mark.asyncio
async def test_create_list(auth_client):
    client, user = auth_client
    resp = await client.post("/lists", json={"title": "Groceries"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Groceries"
    assert data["owner_id"] == user["id"]
    assert data["archived"] is False


@pytest.mark.asyncio
async def test_list_lists(auth_client):
    client, user = auth_client
    await client.post("/lists", json={"title": "List 1"})
    await client.post("/lists", json={"title": "List 2"})
    resp = await client.get("/lists")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_get_list(auth_client):
    client, user = auth_client
    create_resp = await client.post("/lists", json={"title": "My List"})
    list_id = create_resp.json()["id"]
    resp = await client.get(f"/lists/{list_id}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "My List"


@pytest.mark.asyncio
async def test_update_list(auth_client):
    client, user = auth_client
    create_resp = await client.post("/lists", json={"title": "Old Title"})
    list_id = create_resp.json()["id"]
    resp = await client.patch(f"/lists/{list_id}", json={"title": "New Title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_archive_and_restore(auth_client):
    client, user = auth_client
    create_resp = await client.post("/lists", json={"title": "Archivable"})
    list_id = create_resp.json()["id"]

    # Archive
    resp = await client.post(f"/lists/{list_id}/archive")
    assert resp.status_code == 200
    assert resp.json()["archived"] is True

    # Should not appear in default listing
    resp = await client.get("/lists")
    assert len(resp.json()) == 0

    # Should appear with include_archived
    resp = await client.get("/lists?include_archived=true")
    assert len(resp.json()) == 1

    # Restore
    resp = await client.post(f"/lists/{list_id}/restore")
    assert resp.status_code == 200
    assert resp.json()["archived"] is False


@pytest.mark.asyncio
async def test_delete_list(auth_client):
    client, user = auth_client
    create_resp = await client.post("/lists", json={"title": "Delete Me"})
    list_id = create_resp.json()["id"]
    resp = await client.delete(f"/lists/{list_id}")
    assert resp.status_code == 204
    resp = await client.get(f"/lists/{list_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_search_lists(auth_client):
    client, user = auth_client
    await client.post("/lists", json={"title": "Grocery Shopping"})
    await client.post("/lists", json={"title": "Work Tasks"})
    resp = await client.get("/lists?q=grocery")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Grocery Shopping"


@pytest.mark.asyncio
async def test_unauthorized_access(client):
    resp = await client.get("/lists")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cannot_access_others_list(auth_client, second_user_and_token):
    client, user = auth_client
    create_resp = await client.post("/lists", json={"title": "Private"})
    list_id = create_resp.json()["id"]

    # Switch to second user
    _, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    resp = await client.get(f"/lists/{list_id}")
    assert resp.status_code == 404
