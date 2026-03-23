import aiosqlite

from app.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_shares (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id),
    user_id TEXT REFERENCES users(id),
    share_token TEXT UNIQUE NOT NULL,
    permission TEXT NOT NULL CHECK(permission IN ('read', 'write')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id),
    parent_id TEXT REFERENCES nodes(id),
    type TEXT NOT NULL CHECK(type IN ('item', 'section')),
    text TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    checked_at TEXT,
    notes TEXT,
    priority TEXT CHECK(priority IN ('high', 'medium', 'low', NULL)),
    due_date TEXT,
    position REAL NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_settings (
    list_id TEXT PRIMARY KEY REFERENCES lists(id) ON DELETE CASCADE,
    auto_archive_enabled INTEGER NOT NULL DEFAULT 0,
    auto_archive_minutes INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE IF NOT EXISTS device_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    api_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    list_id TEXT NOT NULL REFERENCES lists(id),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nodes_list ON nodes(list_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_list_shares_token ON list_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_list_shares_user ON list_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_node ON attachments(node_id);
"""


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.database_url)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
    finally:
        await db.close()


async def init_db(db_path: str | None = None):
    path = db_path or settings.database_url
    async with aiosqlite.connect(path) as db:
        await db.execute("PRAGMA foreign_keys=ON")
        await db.executescript(SCHEMA)
        # Migration: add pinned column if missing
        try:
            await db.execute("ALTER TABLE nodes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass  # column already exists
        # Migration: add checked_at column
        try:
            await db.execute("ALTER TABLE nodes ADD COLUMN checked_at TEXT")
            # Backfill: set checked_at for already-checked items
            await db.execute("UPDATE nodes SET checked_at = datetime('now') WHERE checked = 1 AND checked_at IS NULL")
        except Exception:
            pass  # column already exists
        # Migration: add archived column
        try:
            await db.execute("ALTER TABLE nodes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass  # column already exists
        # Backfill: archive already-checked items on lists with auto-archive enabled
        await db.execute("""
            UPDATE nodes SET archived = 1
            WHERE checked = 1 AND archived = 0
              AND list_id IN (SELECT list_id FROM list_settings WHERE auto_archive_enabled = 1)
        """)
        # Create index on archived (after column exists)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_nodes_archived ON nodes(list_id, archived)")
        await db.commit()
