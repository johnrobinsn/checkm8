import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.lists.service import check_write_permission, get_accessible_list
from app.nodes.service import create_node, delete_node, get_node, get_nodes, import_nodes, move_node, update_node
from app.schemas import ImportRequest, NodeCreate, NodeMove, NodeOut, NodeUpdate
from app.ws.manager import manager

router = APIRouter(prefix="/lists/{list_id}/nodes", tags=["nodes"])


def _node_out(node: dict) -> NodeOut:
    return NodeOut(**{**node, "checked": bool(node["checked"]), "pinned": bool(node.get("pinned", 0))})


@router.get("", response_model=list[NodeOut])
async def list_nodes(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    nodes = await get_nodes(db, list_id)
    return [_node_out(n) for n in nodes]


@router.post("", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
async def create(
    list_id: str,
    body: NodeCreate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    try:
        node = await create_node(
            db,
            list_id=list_id,
            node_type=body.type.value,
            text=body.text,
            parent_id=body.parent_id,
            after_id=body.after_id,
            checked=body.checked,
            notes=body.notes,
            priority=body.priority.value if body.priority else None,
            due_date=body.due_date,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out = _node_out(node)
    await manager.broadcast(list_id, {"type": "node_created", "node": out.model_dump()}, exclude_user=user["id"])
    return out


@router.post("/import", response_model=list[NodeOut], status_code=status.HTTP_201_CREATED)
async def import_batch(
    list_id: str,
    body: ImportRequest,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    try:
        created = await import_nodes(db, list_id, body.nodes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    results = [_node_out(n) for n in created]
    for out in results:
        await manager.broadcast(list_id, {"type": "node_created", "node": out.model_dump()}, exclude_user=user["id"])
    return results


@router.get("/{node_id}", response_model=NodeOut)
async def get_one(
    list_id: str,
    node_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    node = await get_node(db, node_id)
    if not node or node["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Node not found")
    return _node_out(node)


@router.patch("/{node_id}", response_model=NodeOut)
async def update(
    list_id: str,
    node_id: str,
    body: NodeUpdate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    node = await get_node(db, node_id)
    if not node or node["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Node not found")
    updates = body.model_dump(exclude_unset=True)
    if "priority" in updates and updates["priority"] is not None:
        updates["priority"] = updates["priority"].value
    updated = await update_node(db, node_id, updates)
    out = _node_out(updated)
    await manager.broadcast(list_id, {"type": "node_updated", "node": out.model_dump()}, exclude_user=user["id"])
    return out


@router.post("/{node_id}/move", response_model=NodeOut)
async def move(
    list_id: str,
    node_id: str,
    body: NodeMove,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    node = await get_node(db, node_id)
    if not node or node["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Node not found")
    try:
        moved = await move_node(db, node_id, body.parent_id, body.after_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out = _node_out(moved)
    await manager.broadcast(list_id, {"type": "node_moved", "node": out.model_dump()}, exclude_user=user["id"])
    return out


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    list_id: str,
    node_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    node = await get_node(db, node_id)
    if not node or node["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Node not found")
    await delete_node(db, node_id)
    await manager.broadcast(list_id, {"type": "node_deleted", "node_id": node_id}, exclude_user=user["id"])
