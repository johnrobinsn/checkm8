import pytest


@pytest.mark.asyncio
async def test_create_share_link(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    resp = await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["permission"] == "read"
    assert data["share_token"]
    assert data["user_id"] is None  # unclaimed


@pytest.mark.asyncio
async def test_claim_share(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    share = (await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})).json()

    # Switch to second user
    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    resp = await client.post(f"/shares/claim/{share['share_token']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["list_id"] == lst["id"]
    assert data["permission"] == "read"


@pytest.mark.asyncio
async def test_shared_user_can_read(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    share = (await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})).json()

    # Add a node
    await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "Item 1"})

    # Second user claims and reads
    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    await client.post(f"/shares/claim/{share['share_token']}")

    resp = await client.get(f"/lists/{lst['id']}")
    assert resp.status_code == 200

    resp = await client.get(f"/lists/{lst['id']}/nodes")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_read_only_cannot_write(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    share = (await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})).json()

    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    await client.post(f"/shares/claim/{share['share_token']}")

    resp = await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "Nope"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_write_share_can_write(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    share = (await client.post(f"/lists/{lst['id']}/shares", json={"permission": "write"})).json()

    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    await client.post(f"/shares/claim/{share['share_token']}")

    resp = await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "Added by user2"})
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_list_shares(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})
    await client.post(f"/lists/{lst['id']}/shares", json={"permission": "write"})

    resp = await client.get(f"/lists/{lst['id']}/shares")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_revoke_share(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared"})).json()
    share = (await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})).json()

    resp = await client.delete(f"/lists/{lst['id']}/shares/{share['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/lists/{lst['id']}/shares")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_non_owner_cannot_create_share(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Mine"})).json()

    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    resp = await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invalid_share_token(auth_client):
    client, user = auth_client
    resp = await client.post("/shares/claim/invalid-token-xyz")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_shared_list_appears_in_listing(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Shared List"})).json()
    share = (await client.post(f"/lists/{lst['id']}/shares", json={"permission": "read"})).json()

    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    await client.post(f"/shares/claim/{share['share_token']}")

    resp = await client.get("/lists")
    assert resp.status_code == 200
    titles = [l["title"] for l in resp.json()]
    assert "Shared List" in titles
