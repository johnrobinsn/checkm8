import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse
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
async def google_login(cli_callback: str | None = None):
    state = f"cli:{cli_callback}" if cli_callback else ""
    return {"url": get_google_login_url(state=state)}


@router.get("/google/callback")
async def google_callback(
    code: str,
    response: Response,
    state: str = "",
    db: aiosqlite.Connection = Depends(get_db),
):
    from urllib.parse import unquote
    state = unquote(state)

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

    # CLI OAuth flow: create API token and redirect to CLI's local server
    if state.startswith("cli:"):
        cli_callback = state[4:]
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO api_tokens (id, user_id, token_hash, name) VALUES (?, ?, ?, ?)",
            (token_id, user["id"], token_hash, "CLI login"),
        )
        await db.commit()
        return RedirectResponse(url=f"{cli_callback}?token={raw_token}&user={name}&email={email}")

    # Device code flow: generate short code, create API token, show code in browser
    if state == "device":
        import random
        import string
        device_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO api_tokens (id, user_id, token_hash, name) VALUES (?, ?, ?, ?)",
            (token_id, user["id"], token_hash, "CLI (device code)"),
        )
        expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        await db.execute(
            "INSERT OR REPLACE INTO device_codes (code, user_id, api_token, expires_at) VALUES (?, ?, ?, ?)",
            (device_code, user["id"], raw_token, expires),
        )
        await db.commit()
        return HTMLResponse(f"""<!DOCTYPE html>
<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#f9fafb">
<h2>Your device code</h2>
<p style="font-size:48px;font-weight:bold;letter-spacing:8px;color:#2563eb;margin:30px 0">{device_code}</p>
<p>Enter this code in your terminal to complete authentication.</p>
<p style="color:#6b7280;font-size:14px">This code expires in 10 minutes.</p>
</body></html>""")

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


@router.get("/device")
async def device_login():
    """Start device code flow — redirects to Google OAuth."""
    return RedirectResponse(url=get_google_login_url(state="device"))


@router.post("/device/exchange")
async def device_exchange(
    body: dict,
    db: aiosqlite.Connection = Depends(get_db),
):
    """CLI sends the device code, gets back an API token."""
    code = body.get("code", "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    rows = await db.execute_fetchall("SELECT * FROM device_codes WHERE code = ?", (code,))
    if not rows:
        raise HTTPException(status_code=404, detail="Invalid code")

    row = dict(rows[0])
    expires = datetime.fromisoformat(row["expires_at"])
    if datetime.now(timezone.utc) > expires:
        await db.execute("DELETE FROM device_codes WHERE code = ?", (code,))
        await db.commit()
        raise HTTPException(status_code=410, detail="Code expired")

    api_token = row["api_token"]
    user_id = row["user_id"]

    # Clean up used code
    await db.execute("DELETE FROM device_codes WHERE code = ?", (code,))
    await db.commit()

    # Get user info
    user_rows = await db.execute_fetchall("SELECT * FROM users WHERE id = ?", (user_id,))
    user = dict(user_rows[0]) if user_rows else {}

    return {
        "token": api_token,
        "user": user.get("name", ""),
        "email": user.get("email", ""),
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}
