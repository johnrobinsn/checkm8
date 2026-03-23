import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.lists.service import check_write_permission, get_accessible_list
from app.lists.service import get_settings
from app.nodes.service import archive_eligible_nodes, create_node, delete_node, get_autocomplete, get_node, get_nodes, import_nodes, list_archived, move_node, update_node
from app.schemas import AutocompleteSuggestion, ImportRequest, NodeCreate, NodeMove, NodeOut, NodeUpdate
from app.ws.manager import manager

router = APIRouter(prefix="/lists/{list_id}/nodes", tags=["nodes"])


def _node_out(node: dict) -> NodeOut:
    return NodeOut(**{**node, "checked": bool(node["checked"]), "pinned": bool(node.get("pinned", 0)), "archived": bool(node.get("archived", 0))})


@router.get("", response_model=list[NodeOut])
async def list_nodes(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    # Lazy auto-archive: archive eligible items before returning
    settings = await get_settings(db, list_id)
    if settings["auto_archive_enabled"]:
        archived_ids = await archive_eligible_nodes(db, list_id, settings["auto_archive_minutes"])
        if archived_ids:
            await manager.broadcast(list_id, {"type": "nodes_archived", "node_ids": archived_ids})
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
            at_beginning=body.at_beginning,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out = _node_out(node)
    await manager.broadcast(list_id, {"type": "node_created", "node": out.model_dump()}, exclude_user=None)
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
        await manager.broadcast(list_id, {"type": "node_created", "node": out.model_dump()}, exclude_user=None)
    return results


@router.get("/autocomplete", response_model=list[AutocompleteSuggestion])
async def autocomplete(
    list_id: str,
    q: str = "",
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await get_accessible_list(db, list_id, user["id"]):
        raise HTTPException(status_code=404, detail="List not found")
    results = await get_autocomplete(db, list_id, q.strip())
    return [AutocompleteSuggestion(**r) for r in results]


@router.get("/archived")
async def get_archived(
    list_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await get_accessible_list(db, list_id, user["id"]):
        raise HTTPException(status_code=404, detail="List not found")
    items, total = await list_archived(db, list_id, offset=offset, limit=limit)
    return {"items": [_node_out(n).model_dump() for n in items], "total": total, "offset": offset, "limit": limit}


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
    await manager.broadcast(list_id, {"type": "node_updated", "node": out.model_dump()}, exclude_user=None)
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
        moved = await move_node(db, node_id, body.parent_id, body.after_id, at_beginning=body.at_beginning)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    out = _node_out(moved)
    await manager.broadcast(list_id, {"type": "node_moved", "node": out.model_dump()}, exclude_user=None)
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
    await manager.broadcast(list_id, {"type": "node_deleted", "node_id": node_id}, exclude_user=None)
