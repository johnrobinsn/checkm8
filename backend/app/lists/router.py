import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.lists.service import (
    archive_list,
    check_write_permission,
    create_list,
    delete_list,
    get_accessible_list,
    get_settings,
    get_user_lists,
    restore_list,
    search_lists,
    update_list,
    update_settings,
)
from app.nodes.service import archive_eligible_nodes, clear_archived
from app.schemas import ListCreate, ListOut, ListSearchOut, ListSettings, ListSettingsUpdate, ListUpdate
from app.ws.manager import manager

router = APIRouter(prefix="/lists", tags=["lists"])


@router.post("", response_model=ListOut, status_code=status.HTTP_201_CREATED)
async def create(
    body: ListCreate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await create_list(db, body.title, user["id"])
    await manager.broadcast_global({"type": "list_created", "list": lst})
    return ListOut(**lst)


@router.get("")
async def list_all(
    include_archived: bool = Query(False),
    q: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> list[ListOut] | list[ListSearchOut]:
    if q:
        results = await search_lists(db, user["id"], q)
        return [ListSearchOut(**r) for r in results]
    else:
        results = await get_user_lists(db, user["id"], include_archived=include_archived)
        return [ListOut(**r) for r in results]


@router.get("/{list_id}", response_model=ListOut)
async def get_one(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    return ListOut(**lst)


@router.patch("/{list_id}", response_model=ListOut)
async def update(
    list_id: str,
    body: ListUpdate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    if body.title is not None:
        lst = await update_list(db, list_id, body.title)
        await manager.broadcast_global({"type": "list_updated", "list": lst})
        return ListOut(**lst)
    lst = await get_accessible_list(db, list_id, user["id"])
    return ListOut(**lst)


@router.post("/{list_id}/archive", response_model=ListOut)
async def archive(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst or lst["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can archive")
    result = await archive_list(db, list_id)
    await manager.broadcast_global({"type": "list_archived", "list": result})
    return ListOut(**result)


@router.post("/{list_id}/restore", response_model=ListOut)
async def restore(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst or lst["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can restore")
    result = await restore_list(db, list_id)
    await manager.broadcast_global({"type": "list_restored", "list": result})
    return ListOut(**result)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst or lst["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete")
    await delete_list(db, list_id)
    await manager.broadcast_global({"type": "list_deleted", "list_id": list_id})


@router.get("/{list_id}/settings", response_model=ListSettings)
async def get_list_settings(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await get_accessible_list(db, list_id, user["id"]):
        raise HTTPException(status_code=404, detail="List not found")
    s = await get_settings(db, list_id)
    return ListSettings(
        auto_archive_enabled=bool(s["auto_archive_enabled"]),
        auto_archive_minutes=s["auto_archive_minutes"],
    )


@router.patch("/{list_id}/settings", response_model=ListSettings)
async def patch_list_settings(
    list_id: str,
    body: ListSettingsUpdate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    updates = body.model_dump(exclude_none=True)
    s = await update_settings(db, list_id, updates)
    return ListSettings(
        auto_archive_enabled=bool(s["auto_archive_enabled"]),
        auto_archive_minutes=s["auto_archive_minutes"],
    )


@router.post("/{list_id}/archive-completed")
async def archive_completed(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await get_accessible_list(db, list_id, user["id"]):
        raise HTTPException(status_code=404, detail="List not found")
    s = await get_settings(db, list_id)
    if not s["auto_archive_enabled"]:
        return {"archived_count": 0, "archived_ids": []}
    ids = await archive_eligible_nodes(db, list_id, s["auto_archive_minutes"])
    if ids:
        await manager.broadcast(list_id, {"type": "nodes_archived", "node_ids": ids})
    return {"archived_count": len(ids), "archived_ids": ids}


@router.delete("/{list_id}/archived")
async def delete_archived(
    list_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    count = await clear_archived(db, list_id)
    return {"deleted_count": count}
