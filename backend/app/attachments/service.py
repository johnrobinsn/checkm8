import os
import shutil
import uuid
from pathlib import Path

import aiosqlite

from app.config import settings

UPLOADS_DIR = Path(settings.database_url).resolve().parent / "uploads"


def _ensure_uploads_dir():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


async def create_attachment(
    db: aiosqlite.Connection,
    node_id: str,
    list_id: str,
    filename: str,
    mime_type: str,
    data: bytes,
) -> dict:
    _ensure_uploads_dir()
    attachment_id = str(uuid.uuid4())
    ext = Path(filename).suffix
    node_dir = UPLOADS_DIR / node_id
    node_dir.mkdir(parents=True, exist_ok=True)
    storage_path = str(node_dir / f"{attachment_id}{ext}")

    with open(storage_path, "wb") as f:
        f.write(data)

    size = len(data)
    await db.execute(
        """
        INSERT INTO attachments (id, node_id, list_id, filename, mime_type, size, storage_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (attachment_id, node_id, list_id, filename, mime_type, size, storage_path),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM attachments WHERE id = ?", (attachment_id,))
    return dict(rows[0])


async def list_attachments(db: aiosqlite.Connection, node_id: str) -> list[dict]:
    rows = await db.execute_fetchall(
        "SELECT * FROM attachments WHERE node_id = ? ORDER BY created_at ASC",
        (node_id,),
    )
    return [dict(r) for r in rows]


async def get_attachment(db: aiosqlite.Connection, attachment_id: str) -> dict | None:
    rows = await db.execute_fetchall("SELECT * FROM attachments WHERE id = ?", (attachment_id,))
    return dict(rows[0]) if rows else None


async def delete_attachment(db: aiosqlite.Connection, attachment_id: str):
    att = await get_attachment(db, attachment_id)
    if not att:
        return
    # Remove file from disk
    try:
        os.remove(att["storage_path"])
    except FileNotFoundError:
        pass
    # Remove empty node directory
    node_dir = Path(att["storage_path"]).parent
    try:
        if node_dir.exists() and not any(node_dir.iterdir()):
            node_dir.rmdir()
    except OSError:
        pass
    await db.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
    await db.commit()


async def delete_node_attachments(node_id: str):
    """Remove the entire uploads directory for a node (called on node deletion)."""
    node_dir = UPLOADS_DIR / node_id
    if node_dir.exists():
        shutil.rmtree(node_dir, ignore_errors=True)
