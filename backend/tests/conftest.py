import os
import tempfile
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.config import settings
from app.database import init_db


def _make_jwt(user_id: str) -> str:
    return jwt.encode({"sub": user_id}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@pytest.fixture(autouse=True)
def _tmp_db(tmp_path):
    """Use a fresh SQLite file for each test."""
    db_path = str(tmp_path / "test.db")
    settings.database_url = db_path
    yield db_path


@pytest_asyncio.fixture
async def db(tmp_path):
    """Initialize and return the DB path (already set by _tmp_db)."""
    await init_db(settings.database_url)
    return settings.database_url


@pytest_asyncio.fixture
async def client(db):
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def user_and_token(db):
    """Create a test user directly in the DB and return (user_dict, jwt_token)."""
    import aiosqlite
    user_id = str(uuid.uuid4())
    async with aiosqlite.connect(settings.database_url) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute(
            "INSERT INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)",
            (user_id, f"google_{user_id}", f"user_{user_id[:8]}@test.com", "Test User"),
        )
        await conn.commit()
        rows = await conn.execute_fetchall("SELECT * FROM users WHERE id = ?", (user_id,))
        user = dict(rows[0])
    token = _make_jwt(user_id)
    return user, token


@pytest_asyncio.fixture
async def auth_client(client, user_and_token):
    """Client with auth headers pre-set."""
    user, token = user_and_token
    client.headers["Authorization"] = f"Bearer {token}"
    return client, user


@pytest_asyncio.fixture
async def second_user_and_token(db):
    """Create a second test user."""
    import aiosqlite
    user_id = str(uuid.uuid4())
    async with aiosqlite.connect(settings.database_url) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute(
            "INSERT INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)",
            (user_id, f"google_{user_id}", f"user2_{user_id[:8]}@test.com", "Test User 2"),
        )
        await conn.commit()
        rows = await conn.execute_fetchall("SELECT * FROM users WHERE id = ?", (user_id,))
        user = dict(rows[0])
    token = _make_jwt(user_id)
    return user, token
