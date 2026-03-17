import secrets
import uuid

import aiosqlite


async def create_share_link(
    db: aiosqlite.Connection, list_id: str, permission: str
) -> dict:
    share_id = str(uuid.uuid4())
    share_token = secrets.token_urlsafe(16)
    await db.execute(
        "INSERT INTO list_shares (id, list_id, share_token, permission) VALUES (?, ?, ?, ?)",
        (share_id, list_id, share_token, permission),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM list_shares WHERE id = ?", (share_id,))
    return dict(rows[0])


async def claim_share(db: aiosqlite.Connection, share_token: str, user_id: str) -> dict | None:
    rows = await db.execute_fetchall(
        "SELECT * FROM list_shares WHERE share_token = ?", (share_token,)
    )
    if not rows:
        return None
    share = dict(rows[0])

    # Check if this user already has a share for this list
    existing = await db.execute_fetchall(
        "SELECT * FROM list_shares WHERE list_id = ? AND user_id = ?",
        (share["list_id"], user_id),
    )
    if existing:
        return dict(existing[0])

    # Check if user is the owner
    list_rows = await db.execute_fetchall("SELECT owner_id FROM lists WHERE id = ?", (share["list_id"],))
    if list_rows and dict(list_rows[0])["owner_id"] == user_id:
        return share  # Owner doesn't need a share entry

    if share["user_id"] is None:
        # Unclaimed share — claim it
        await db.execute(
            "UPDATE list_shares SET user_id = ? WHERE id = ?",
            (user_id, share["id"]),
        )
        await db.commit()
        rows = await db.execute_fetchall("SELECT * FROM list_shares WHERE id = ?", (share["id"],))
        return dict(rows[0])
    elif share["user_id"] == user_id:
        return share
    else:
        # Already claimed by someone else — create a new share for this user
        new_share = await create_share_link(db, share["list_id"], share["permission"])
        await db.execute(
            "UPDATE list_shares SET user_id = ? WHERE id = ?",
            (user_id, new_share["id"]),
        )
        await db.commit()
        rows = await db.execute_fetchall("SELECT * FROM list_shares WHERE id = ?", (new_share["id"],))
        return dict(rows[0])


async def get_shares(db: aiosqlite.Connection, list_id: str) -> list[dict]:
    rows = await db.execute_fetchall(
        "SELECT * FROM list_shares WHERE list_id = ?", (list_id,)
    )
    return [dict(r) for r in rows]


async def revoke_share(db: aiosqlite.Connection, share_id: str, list_id: str) -> bool:
    rows = await db.execute_fetchall(
        "SELECT * FROM list_shares WHERE id = ? AND list_id = ?",
        (share_id, list_id),
    )
    if not rows:
        return False
    await db.execute("DELETE FROM list_shares WHERE id = ?", (share_id,))
    await db.commit()
    return True
