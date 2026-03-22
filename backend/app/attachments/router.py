import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.lists.service import check_write_permission, get_accessible_list
from app.nodes.service import get_node
from app.attachments.service import (
    create_attachment,
    delete_attachment,
    get_attachment,
    list_attachments,
)
from app.schemas import AttachmentOut

router = APIRouter(prefix="/lists/{list_id}/nodes/{node_id}/attachments", tags=["attachments"])


def _attachment_out(att: dict) -> AttachmentOut:
    url = f"/lists/{att['list_id']}/nodes/{att['node_id']}/attachments/{att['id']}/file"
    return AttachmentOut(
        id=att["id"],
        node_id=att["node_id"],
        list_id=att["list_id"],
        filename=att["filename"],
        mime_type=att["mime_type"],
        size=att["size"],
        created_at=att["created_at"],
        url=url,
    )


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload(
    list_id: str,
    node_id: str,
    file: UploadFile,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    node = await get_node(db, node_id)
    if not node or node["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Node not found")

    data = await file.read()
    import logging
    logging.getLogger("checkm8").info(
        f"Upload: {file.filename} size={len(data)} bytes ({len(data)/1024/1024:.1f} MB) type={file.content_type}"
    )
    if len(data) > 50 * 1024 * 1024:  # 50 MB limit
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    att = await create_attachment(
        db,
        node_id=node_id,
        list_id=list_id,
        filename=file.filename or "untitled",
        mime_type=file.content_type or "application/octet-stream",
        data=data,
    )
    return _attachment_out(att)


@router.get("", response_model=list[AttachmentOut])
async def list_node_attachments(
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
    atts = await list_attachments(db, node_id)
    return [_attachment_out(a) for a in atts]


@router.get("/{attachment_id}/file")
async def download(
    list_id: str,
    node_id: str,
    attachment_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    lst = await get_accessible_list(db, list_id, user["id"])
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    att = await get_attachment(db, attachment_id)
    if not att or att["node_id"] != node_id or att["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(
        att["storage_path"],
        media_type=att["mime_type"],
        filename=att["filename"],
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    list_id: str,
    node_id: str,
    attachment_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not await check_write_permission(db, list_id, user["id"]):
        raise HTTPException(status_code=403, detail="No write access")
    att = await get_attachment(db, attachment_id)
    if not att or att["node_id"] != node_id or att["list_id"] != list_id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    await delete_attachment(db, attachment_id)
