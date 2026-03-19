import uuid

import aiosqlite


async def _next_position(db: aiosqlite.Connection, list_id: str, parent_id: str | None, after_id: str | None, at_beginning: bool = False) -> float:
    """Calculate position for a new node."""
    if after_id:
        rows = await db.execute_fetchall("SELECT position FROM nodes WHERE id = ?", (after_id,))
        if not rows:
            raise ValueError("after_id node not found")
        after_pos = rows[0]["position"]
        # Find the next sibling after after_id
        next_rows = await db.execute_fetchall(
            """
            SELECT position FROM nodes
            WHERE list_id = ? AND parent_id IS ? AND position > ?
            ORDER BY position ASC LIMIT 1
            """,
            (list_id, parent_id, after_pos),
        )
        if next_rows:
            return (after_pos + next_rows[0]["position"]) / 2.0
        return after_pos + 1.0
    elif at_beginning:
        # Insert at beginning
        rows = await db.execute_fetchall(
            """
            SELECT MIN(position) as min_pos FROM nodes
            WHERE list_id = ? AND parent_id IS ?
            """,
            (list_id, parent_id),
        )
        min_pos = rows[0]["min_pos"] if rows and rows[0]["min_pos"] is not None else 1.0
        return min_pos - 1.0
    else:
        # Insert at end
        rows = await db.execute_fetchall(
            """
            SELECT MAX(position) as max_pos FROM nodes
            WHERE list_id = ? AND parent_id IS ?
            """,
            (list_id, parent_id),
        )
        max_pos = rows[0]["max_pos"] if rows and rows[0]["max_pos"] is not None else 0.0
        return max_pos + 1.0


async def _get_depth(db: aiosqlite.Connection, node_id: str | None) -> int:
    """Get the depth of a node (0 for root level)."""
    if node_id is None:
        return 0
    depth = 0
    current = node_id
    while current is not None:
        depth += 1
        rows = await db.execute_fetchall("SELECT parent_id FROM nodes WHERE id = ?", (current,))
        if not rows:
            break
        current = rows[0]["parent_id"]
    return depth


async def _get_subtree_max_depth(db: aiosqlite.Connection, node_id: str) -> int:
    """Get the maximum depth of the subtree rooted at node_id (relative to node_id)."""
    rows = await db.execute_fetchall(
        "SELECT id FROM nodes WHERE parent_id = ?", (node_id,)
    )
    if not rows:
        return 0
    max_child_depth = 0
    for row in rows:
        child_depth = await _get_subtree_max_depth(db, row["id"])
        max_child_depth = max(max_child_depth, child_depth + 1)
    return max_child_depth


async def create_node(
    db: aiosqlite.Connection,
    list_id: str,
    node_type: str,
    text: str = "",
    parent_id: str | None = None,
    after_id: str | None = None,
    checked: bool = False,
    notes: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
    at_beginning: bool = False,
) -> dict:
    # Validate depth
    if parent_id is not None:
        depth = await _get_depth(db, parent_id)
        if depth >= 5:
            raise ValueError("Maximum nesting depth (5) exceeded")

    position = await _next_position(db, list_id, parent_id, after_id, at_beginning=at_beginning)
    node_id = str(uuid.uuid4())

    await db.execute(
        """
        INSERT INTO nodes (id, list_id, parent_id, type, text, checked, notes, priority, due_date, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (node_id, list_id, parent_id, node_type, text, int(checked), notes, priority, due_date, position),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM nodes WHERE id = ?", (node_id,))
    return dict(rows[0])


async def get_nodes(db: aiosqlite.Connection, list_id: str) -> list[dict]:
    rows = await db.execute_fetchall(
        "SELECT * FROM nodes WHERE list_id = ? ORDER BY position ASC",
        (list_id,),
    )
    return [dict(r) for r in rows]


async def get_node(db: aiosqlite.Connection, node_id: str) -> dict | None:
    rows = await db.execute_fetchall("SELECT * FROM nodes WHERE id = ?", (node_id,))
    return dict(rows[0]) if rows else None


async def update_node(db: aiosqlite.Connection, node_id: str, updates: dict) -> dict:
    set_clauses = []
    values = []
    nullable_fields = {"notes", "priority", "due_date"}
    for key in ("text", "checked", "notes", "priority", "due_date", "pinned"):
        if key not in updates:
            continue
        # Allow nullable fields to be set to None (to clear them)
        if updates[key] is None and key not in nullable_fields:
            continue
        if key in ("checked", "pinned"):
            set_clauses.append(f"{key} = ?")
            values.append(int(updates[key]))
        else:
            set_clauses.append(f"{key} = ?")
            values.append(updates[key])

    if not set_clauses:
        rows = await db.execute_fetchall("SELECT * FROM nodes WHERE id = ?", (node_id,))
        return dict(rows[0])

    set_clauses.append("updated_at = datetime('now')")
    values.append(node_id)

    await db.execute(
        f"UPDATE nodes SET {', '.join(set_clauses)} WHERE id = ?",
        values,
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM nodes WHERE id = ?", (node_id,))
    return dict(rows[0])


async def move_node(
    db: aiosqlite.Connection,
    node_id: str,
    new_parent_id: str | None,
    after_id: str | None,
    at_beginning: bool = False,
) -> dict:
    node = await get_node(db, node_id)
    if not node:
        raise ValueError("Node not found")

    # Validate depth: new parent depth + subtree depth of moving node must be <= 5
    if new_parent_id is not None:
        new_parent_depth = await _get_depth(db, new_parent_id)
        subtree_depth = await _get_subtree_max_depth(db, node_id)
        if new_parent_depth + subtree_depth + 1 > 5:
            raise ValueError("Move would exceed maximum nesting depth (5)")

    position = await _next_position(db, node["list_id"], new_parent_id, after_id, at_beginning=at_beginning)

    await db.execute(
        "UPDATE nodes SET parent_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?",
        (new_parent_id, position, node_id),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM nodes WHERE id = ?", (node_id,))
    return dict(rows[0])


async def import_nodes(
    db: aiosqlite.Connection,
    list_id: str,
    nodes: list,
    parent_id: str | None = None,
    current_depth: int = 0,
) -> list[dict]:
    """Recursively import a tree of nodes, preserving hierarchy."""
    if current_depth >= 5:
        raise ValueError("Maximum nesting depth (5) exceeded")

    created: list[dict] = []
    for imp in nodes:
        position = await _next_position(db, list_id, parent_id, after_id=None)
        node_id = str(uuid.uuid4())

        await db.execute(
            """
            INSERT INTO nodes (id, list_id, parent_id, type, text, checked, notes, priority, due_date, position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                node_id, list_id, parent_id,
                imp.type.value, imp.text, int(imp.checked),
                imp.notes,
                imp.priority.value if imp.priority else None,
                imp.due_date, position,
            ),
        )
        await db.commit()
        rows = await db.execute_fetchall("SELECT * FROM nodes WHERE id = ?", (node_id,))
        created.append(dict(rows[0]))

        if imp.children:
            child_nodes = await import_nodes(db, list_id, imp.children, parent_id=node_id, current_depth=current_depth + 1)
            created.extend(child_nodes)

    return created


async def search_sections(
    db: aiosqlite.Connection,
    user_id: str,
    query: str,
    current_list_id: str | None = None,
) -> list[dict]:
    """Search for sections across all accessible lists."""
    rows = await db.execute_fetchall(
        """
        SELECT n.id, n.text, n.list_id, l.title as list_title
        FROM nodes n
        JOIN lists l ON n.list_id = l.id
        WHERE n.type = 'section'
          AND n.text LIKE ?
          AND (l.owner_id = ? OR l.id IN (
            SELECT list_id FROM list_shares WHERE user_id = ?
          ))
        ORDER BY
          CASE WHEN n.list_id = ? THEN 0 ELSE 1 END,
          l.title ASC,
          n.text ASC
        LIMIT 20
        """,
        (f"%{query}%", user_id, user_id, current_list_id or ""),
    )
    return [dict(r) for r in rows]


async def resolve_section(
    db: aiosqlite.Connection,
    user_id: str,
    name: str,
    list_title: str | None = None,
    current_list_id: str | None = None,
) -> dict | None:
    """Resolve a section link to a section_id and list_id."""
    if list_title:
        rows = await db.execute_fetchall(
            """
            SELECT n.id as section_id, n.list_id
            FROM nodes n
            JOIN lists l ON n.list_id = l.id
            WHERE n.type = 'section'
              AND n.text = ?
              AND l.title = ?
              AND (l.owner_id = ? OR l.id IN (
                SELECT list_id FROM list_shares WHERE user_id = ?
              ))
            LIMIT 1
            """,
            (name, list_title, user_id, user_id),
        )
    else:
        # Search current list first, then others
        rows = await db.execute_fetchall(
            """
            SELECT n.id as section_id, n.list_id
            FROM nodes n
            JOIN lists l ON n.list_id = l.id
            WHERE n.type = 'section'
              AND n.text = ?
              AND (l.owner_id = ? OR l.id IN (
                SELECT list_id FROM list_shares WHERE user_id = ?
              ))
            ORDER BY CASE WHEN n.list_id = ? THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (name, user_id, user_id, current_list_id or ""),
        )
    return dict(rows[0]) if rows else None


async def delete_node(db: aiosqlite.Connection, node_id: str):
    """Delete a node and all its descendants."""
    # Recursively delete children first
    children = await db.execute_fetchall("SELECT id FROM nodes WHERE parent_id = ?", (node_id,))
    for child in children:
        await delete_node(db, child["id"])
    await db.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
    await db.commit()
