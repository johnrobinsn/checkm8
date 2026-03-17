import uuid
from datetime import datetime, timezone

import aiosqlite


async def get_accessible_list(db: aiosqlite.Connection, list_id: str, user_id: str) -> dict | None:
    """Get a list if the user owns it or has a share."""
    rows = await db.execute_fetchall("SELECT * FROM lists WHERE id = ?", (list_id,))
    if not rows:
        return None
    lst = dict(rows[0])
    if lst["owner_id"] == user_id:
        return lst
    shares = await db.execute_fetchall(
        "SELECT * FROM list_shares WHERE list_id = ? AND user_id = ?",
        (list_id, user_id),
    )
    if shares:
        return lst
    return None


async def check_write_permission(db: aiosqlite.Connection, list_id: str, user_id: str) -> bool:
    """Check if user has write access (owner or write share)."""
    rows = await db.execute_fetchall("SELECT owner_id FROM lists WHERE id = ?", (list_id,))
    if not rows:
        return False
    if dict(rows[0])["owner_id"] == user_id:
        return True
    shares = await db.execute_fetchall(
        "SELECT * FROM list_shares WHERE list_id = ? AND user_id = ? AND permission = 'write'",
        (list_id, user_id),
    )
    return bool(shares)


async def create_list(db: aiosqlite.Connection, title: str, owner_id: str) -> dict:
    list_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO lists (id, owner_id, title) VALUES (?, ?, ?)",
        (list_id, owner_id, title),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM lists WHERE id = ?", (list_id,))
    return dict(rows[0])


async def get_user_lists(db: aiosqlite.Connection, user_id: str, include_archived: bool = False) -> list[dict]:
    if include_archived:
        query = """
            SELECT l.* FROM lists l WHERE l.owner_id = ?
            UNION
            SELECT l.* FROM lists l JOIN list_shares s ON s.list_id = l.id WHERE s.user_id = ?
            ORDER BY updated_at DESC
        """
    else:
        query = """
            SELECT l.* FROM lists l WHERE l.owner_id = ? AND l.archived = 0
            UNION
            SELECT l.* FROM lists l JOIN list_shares s ON s.list_id = l.id WHERE s.user_id = ? AND l.archived = 0
            ORDER BY updated_at DESC
        """
    rows = await db.execute_fetchall(query, (user_id, user_id))
    return [dict(r) for r in rows]


async def update_list(db: aiosqlite.Connection, list_id: str, title: str) -> dict:
    await db.execute(
        "UPDATE lists SET title = ?, updated_at = datetime('now') WHERE id = ?",
        (title, list_id),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM lists WHERE id = ?", (list_id,))
    return dict(rows[0])


async def archive_list(db: aiosqlite.Connection, list_id: str) -> dict:
    await db.execute(
        "UPDATE lists SET archived = 1, updated_at = datetime('now') WHERE id = ?",
        (list_id,),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM lists WHERE id = ?", (list_id,))
    return dict(rows[0])


async def restore_list(db: aiosqlite.Connection, list_id: str) -> dict:
    await db.execute(
        "UPDATE lists SET archived = 0, updated_at = datetime('now') WHERE id = ?",
        (list_id,),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM lists WHERE id = ?", (list_id,))
    return dict(rows[0])


async def delete_list(db: aiosqlite.Connection, list_id: str):
    await db.execute("DELETE FROM nodes WHERE list_id = ?", (list_id,))
    await db.execute("DELETE FROM list_shares WHERE list_id = ?", (list_id,))
    await db.execute("DELETE FROM lists WHERE id = ?", (list_id,))
    await db.commit()


async def search_lists(db: aiosqlite.Connection, user_id: str, query: str) -> list[dict]:
    pattern = f"%{query}%"
    rows = await db.execute_fetchall(
        """
        SELECT l.* FROM lists l WHERE l.owner_id = ? AND l.title LIKE ? AND l.archived = 0
        UNION
        SELECT l.* FROM lists l JOIN list_shares s ON s.list_id = l.id
        WHERE s.user_id = ? AND l.title LIKE ? AND l.archived = 0
        ORDER BY updated_at DESC
        """,
        (user_id, pattern, user_id, pattern),
    )
    return [dict(r) for r in rows]
