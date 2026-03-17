import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from jose import jwt

from app.auth.dependencies import get_current_user
from app.auth.google import exchange_code, get_google_login_url
from app.config import settings
from app.database import get_db
from app.schemas import AuthResponse, TokenCreate, TokenCreateOut, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _create_jwt(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


@router.get("/google/login")
async def google_login():
    return {"url": get_google_login_url()}


@router.get("/google/callback")
async def google_callback(
    code: str,
    response: Response,
    db: aiosqlite.Connection = Depends(get_db),
):
    userinfo = await exchange_code(code)
    google_id = userinfo["id"]
    email = userinfo["email"]
    name = userinfo.get("name", email)
    avatar_url = userinfo.get("picture")

    # Upsert user
    rows = await db.execute_fetchall("SELECT * FROM users WHERE google_id = ?", (google_id,))
    if rows:
        user = dict(rows[0])
        await db.execute(
            "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?",
            (name, avatar_url, user["id"]),
        )
        await db.commit()
    else:
        user_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO users (id, google_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)",
            (user_id, google_id, email, name, avatar_url),
        )
        await db.commit()
        rows = await db.execute_fetchall("SELECT * FROM users WHERE id = ?", (user_id,))
        user = dict(rows[0])

    token = _create_jwt(user["id"])

    # Redirect browser to frontend with token
    frontend_url = settings.cors_origins[0] if settings.cors_origins else "http://localhost:5173"
    redirect = RedirectResponse(url=f"{frontend_url}/auth/callback?token={token}")
    redirect.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 7)
    return redirect


@router.get("/me", response_model=UserOut)
async def get_me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


@router.post("/tokens", response_model=TokenCreateOut, status_code=status.HTTP_201_CREATED)
async def create_api_token(
    body: TokenCreate,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token_id = str(uuid.uuid4())

    await db.execute(
        "INSERT INTO api_tokens (id, user_id, token_hash, name) VALUES (?, ?, ?, ?)",
        (token_id, user["id"], token_hash, body.name),
    )
    await db.commit()
    rows = await db.execute_fetchall("SELECT * FROM api_tokens WHERE id = ?", (token_id,))
    row = dict(rows[0])

    return TokenCreateOut(
        id=row["id"],
        name=row["name"],
        created_at=row["created_at"],
        last_used_at=row["last_used_at"],
        token=raw_token,
    )


@router.get("/tokens", response_model=list[TokenOut])
async def list_api_tokens(
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    rows = await db.execute_fetchall(
        "SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ?",
        (user["id"],),
    )
    return [TokenOut(**dict(r)) for r in rows]


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_token(
    token_id: str,
    user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    rows = await db.execute_fetchall(
        "SELECT * FROM api_tokens WHERE id = ? AND user_id = ?",
        (token_id, user["id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Token not found")
    await db.execute("DELETE FROM api_tokens WHERE id = ?", (token_id,))
    await db.commit()


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}
