import pytest


@pytest.mark.asyncio
async def test_create_item(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    resp = await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "Buy milk"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == "Buy milk"
    assert data["type"] == "item"
    assert data["checked"] is False


@pytest.mark.asyncio
async def test_create_section(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    resp = await client.post(f"/lists/{lst['id']}/nodes", json={"type": "section", "text": "Dairy"})
    assert resp.status_code == 201
    assert resp.json()["type"] == "section"


@pytest.mark.asyncio
async def test_nested_items(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    section = (await client.post(f"/lists/{lid}/nodes", json={"type": "section", "text": "Groceries"})).json()
    item = (await client.post(f"/lists/{lid}/nodes", json={
        "type": "item", "text": "Milk", "parent_id": section["id"]
    })).json()
    assert item["parent_id"] == section["id"]


@pytest.mark.asyncio
async def test_max_depth_enforced(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    # Create a chain of 5 levels deep
    parent_id = None
    for i in range(5):
        resp = await client.post(f"/lists/{lid}/nodes", json={
            "type": "section", "text": f"Level {i}", "parent_id": parent_id
        })
        assert resp.status_code == 201
        parent_id = resp.json()["id"]

    # 6th level should fail
    resp = await client.post(f"/lists/{lid}/nodes", json={
        "type": "item", "text": "Too deep", "parent_id": parent_id
    })
    assert resp.status_code == 400
    assert "depth" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_nodes(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]
    await client.post(f"/lists/{lid}/nodes", json={"type": "item", "text": "A"})
    await client.post(f"/lists/{lid}/nodes", json={"type": "item", "text": "B"})
    resp = await client.get(f"/lists/{lid}/nodes")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_get_node(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    node = (await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "X"})).json()
    resp = await client.get(f"/lists/{lst['id']}/nodes/{node['id']}")
    assert resp.status_code == 200
    assert resp.json()["text"] == "X"


@pytest.mark.asyncio
async def test_update_node(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    node = (await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "Old"})).json()
    resp = await client.patch(f"/lists/{lst['id']}/nodes/{node['id']}", json={"text": "New", "checked": True})
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "New"
    assert data["checked"] is True


@pytest.mark.asyncio
async def test_update_priority_and_due_date(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    node = (await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "Task"})).json()
    resp = await client.patch(f"/lists/{lst['id']}/nodes/{node['id']}", json={
        "priority": "high", "due_date": "2026-04-01"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["priority"] == "high"
    assert data["due_date"] == "2026-04-01"


@pytest.mark.asyncio
async def test_move_node(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    section = (await client.post(f"/lists/{lid}/nodes", json={"type": "section", "text": "Section"})).json()
    item = (await client.post(f"/lists/{lid}/nodes", json={"type": "item", "text": "Item"})).json()

    # Move item under section
    resp = await client.post(f"/lists/{lid}/nodes/{item['id']}/move", json={"parent_id": section["id"]})
    assert resp.status_code == 200
    assert resp.json()["parent_id"] == section["id"]


@pytest.mark.asyncio
async def test_move_node_depth_check(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    # Create a chain 4 levels deep
    parent_id = None
    for i in range(4):
        resp = await client.post(f"/lists/{lid}/nodes", json={
            "type": "section", "text": f"Level {i}", "parent_id": parent_id
        })
        parent_id = resp.json()["id"]

    # Create a node with a child at root
    parent_node = (await client.post(f"/lists/{lid}/nodes", json={"type": "section", "text": "Parent"})).json()
    child_node = (await client.post(f"/lists/{lid}/nodes", json={
        "type": "item", "text": "Child", "parent_id": parent_node["id"]
    })).json()

    # Moving parent_node under the 4th level should fail (would make child at level 6)
    resp = await client.post(f"/lists/{lid}/nodes/{parent_node['id']}/move", json={"parent_id": parent_id})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_node(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    node = (await client.post(f"/lists/{lid}/nodes", json={"type": "item", "text": "Delete me"})).json()
    resp = await client.delete(f"/lists/{lid}/nodes/{node['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/lists/{lid}/nodes/{node['id']}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_node_cascades_children(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    parent = (await client.post(f"/lists/{lid}/nodes", json={"type": "section", "text": "Parent"})).json()
    child = (await client.post(f"/lists/{lid}/nodes", json={
        "type": "item", "text": "Child", "parent_id": parent["id"]
    })).json()

    await client.delete(f"/lists/{lid}/nodes/{parent['id']}")

    resp = await client.get(f"/lists/{lid}/nodes/{child['id']}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_ordering_with_after_id(auth_client):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Test"})).json()
    lid = lst["id"]

    a = (await client.post(f"/lists/{lid}/nodes", json={"type": "item", "text": "A"})).json()
    c = (await client.post(f"/lists/{lid}/nodes", json={"type": "item", "text": "C"})).json()
    # Insert B after A
    b = (await client.post(f"/lists/{lid}/nodes", json={
        "type": "item", "text": "B", "after_id": a["id"]
    })).json()

    nodes = (await client.get(f"/lists/{lid}/nodes")).json()
    texts = [n["text"] for n in nodes]
    assert texts == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_no_write_access(auth_client, second_user_and_token):
    client, user = auth_client
    lst = (await client.post("/lists", json={"title": "Private"})).json()

    user2, token2 = second_user_and_token
    client.headers["Authorization"] = f"Bearer {token2}"
    resp = await client.post(f"/lists/{lst['id']}/nodes", json={"type": "item", "text": "X"})
    assert resp.status_code == 403
