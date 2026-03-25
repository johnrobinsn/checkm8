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


async def get_settings(db: aiosqlite.Connection, list_id: str) -> dict:
    """Get list settings, returning defaults if no row exists."""
    rows = await db.execute_fetchall(
        "SELECT * FROM list_settings WHERE list_id = ?", (list_id,)
    )
    if rows:
        return dict(rows[0])
    return {"list_id": list_id, "auto_archive_enabled": 0, "auto_archive_minutes": 60}


async def update_settings(db: aiosqlite.Connection, list_id: str, updates: dict) -> dict:
    """Upsert list settings."""
    existing = await db.execute_fetchall(
        "SELECT * FROM list_settings WHERE list_id = ?", (list_id,)
    )
    if existing:
        set_clauses = []
        values = []
        for key in ("auto_archive_enabled", "auto_archive_minutes"):
            if key in updates and updates[key] is not None:
                val = int(updates[key]) if key == "auto_archive_enabled" else updates[key]
                set_clauses.append(f"{key} = ?")
                values.append(val)
        if set_clauses:
            values.append(list_id)
            await db.execute(
                f"UPDATE list_settings SET {', '.join(set_clauses)} WHERE list_id = ?",
                values,
            )
            await db.commit()
    else:
        enabled = int(updates.get("auto_archive_enabled", False))
        minutes = updates.get("auto_archive_minutes", 60)
        await db.execute(
            "INSERT INTO list_settings (list_id, auto_archive_enabled, auto_archive_minutes) VALUES (?, ?, ?)",
            (list_id, enabled, minutes),
        )
        await db.commit()
    return await get_settings(db, list_id)


async def search_lists(db: aiosqlite.Connection, user_id: str, query: str) -> list[dict]:
    pattern = f"%{query}%"
    # Find lists matching by title
    title_rows = await db.execute_fetchall(
        """
        SELECT l.* FROM lists l WHERE l.owner_id = ? AND l.title LIKE ? AND l.archived = 0
        UNION
        SELECT l.* FROM lists l JOIN list_shares s ON s.list_id = l.id
        WHERE s.user_id = ? AND l.title LIKE ? AND l.archived = 0
        """,
        (user_id, pattern, user_id, pattern),
    )
    # Find lists matching by node text or notes
    node_rows = await db.execute_fetchall(
        """
        SELECT DISTINCT l.* FROM lists l
        JOIN nodes n ON n.list_id = l.id
        WHERE l.owner_id = ? AND n.archived = 0 AND (n.text LIKE ? OR n.notes LIKE ?) AND l.archived = 0
        UNION
        SELECT DISTINCT l.* FROM lists l
        JOIN list_shares s ON s.list_id = l.id
        JOIN nodes n ON n.list_id = l.id
        WHERE s.user_id = ? AND n.archived = 0 AND (n.text LIKE ? OR n.notes LIKE ?) AND l.archived = 0
        """,
        (user_id, pattern, pattern, user_id, pattern, pattern),
    )
    # Merge and deduplicate
    seen = set()
    results = []
    for row in list(title_rows) + list(node_rows):
        d = dict(row)
        if d["id"] not in seen:
            seen.add(d["id"])
            results.append(d)
    # For each list, find matching nodes
    for lst in results:
        matching_nodes = await db.execute_fetchall(
            """
            SELECT id, type, text, notes FROM nodes
            WHERE list_id = ? AND archived = 0 AND (text LIKE ? OR notes LIKE ?)
            LIMIT 5
            """,
            (lst["id"], pattern, pattern),
        )
        lst["matching_nodes"] = [dict(n) for n in matching_nodes]
    return results
