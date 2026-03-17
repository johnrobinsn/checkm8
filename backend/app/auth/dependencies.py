import hashlib
from datetime import datetime

import aiosqlite
from fastapi import Cookie, Depends, HTTPException, Header, status
from jose import JWTError, jwt

from app.config import settings
from app.database import get_db


async def get_current_user(
    db: aiosqlite.Connection = Depends(get_db),
    authorization: str | None = Header(None),
    access_token: str | None = Cookie(None),
) -> dict:
    token = None

    # Check Authorization header first
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    # Fall back to cookie
    elif access_token:
        token = access_token

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Try JWT first
    user = await _try_jwt(db, token)
    if user:
        return user

    # Try API token
    user = await _try_api_token(db, token)
    if user:
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def _try_jwt(db: aiosqlite.Connection, token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            return None
        row = await db.execute_fetchall("SELECT * FROM users WHERE id = ?", (user_id,))
        if not row:
            return None
        return dict(row[0])
    except JWTError:
        return None


async def _try_api_token(db: aiosqlite.Connection, token: str) -> dict | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    rows = await db.execute_fetchall(
        """
        SELECT u.* FROM users u
        JOIN api_tokens t ON t.user_id = u.id
        WHERE t.token_hash = ?
        """,
        (token_hash,),
    )
    if not rows:
        return None
    # Update last_used_at
    await db.execute(
        "UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?",
        (token_hash,),
    )
    await db.commit()
    return dict(rows[0])
