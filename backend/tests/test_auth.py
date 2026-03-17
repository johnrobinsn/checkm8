import pytest


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_me_authenticated(auth_client):
    client, user = auth_client
    resp = await client.get("/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == user["id"]
    assert data["email"] == user["email"]


@pytest.mark.asyncio
async def test_me_unauthenticated(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_api_token(auth_client):
    client, user = auth_client
    resp = await client.post("/auth/tokens", json={"name": "CLI token"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "CLI token"
    assert "token" in data  # raw token returned on creation


@pytest.mark.asyncio
async def test_api_token_auth(auth_client):
    client, user = auth_client
    # Create a token
    token_resp = await client.post("/auth/tokens", json={"name": "test"})
    raw_token = token_resp.json()["token"]

    # Use it to authenticate
    client.headers["Authorization"] = f"Bearer {raw_token}"
    resp = await client.get("/auth/me")
    assert resp.status_code == 200
    assert resp.json()["id"] == user["id"]


@pytest.mark.asyncio
async def test_list_tokens(auth_client):
    client, user = auth_client
    await client.post("/auth/tokens", json={"name": "Token 1"})
    await client.post("/auth/tokens", json={"name": "Token 2"})
    resp = await client.get("/auth/tokens")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_delete_token(auth_client):
    client, user = auth_client
    token_resp = await client.post("/auth/tokens", json={"name": "Disposable"})
    token_id = token_resp.json()["id"]
    resp = await client.delete(f"/auth/tokens/{token_id}")
    assert resp.status_code == 204

    resp = await client.get("/auth/tokens")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_invalid_token(client):
    client.headers["Authorization"] = "Bearer invalid-garbage-token"
    resp = await client.get("/auth/me")
    assert resp.status_code == 401
