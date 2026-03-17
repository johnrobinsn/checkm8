import aiosqlite
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.config import settings
from app.database import get_db
from app.ws.manager import manager

router = APIRouter(tags=["websocket"])


async def _authenticate_ws(token: str, db: aiosqlite.Connection) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not user_id:
            return None
        rows = await db.execute_fetchall("SELECT * FROM users WHERE id = ?", (user_id,))
        return dict(rows[0]) if rows else None
    except JWTError:
        return None


@router.websocket("/ws/{list_id}")
async def websocket_endpoint(ws: WebSocket, list_id: str):
    # Auth via query param
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return

    # Get a DB connection (not using Depends in WebSocket)
    db = await aiosqlite.connect(settings.database_url)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys=ON")

    try:
        user = await _authenticate_ws(token, db)
        if not user:
            await ws.close(code=4001, reason="Invalid token")
            return

        await manager.connect(list_id, user["id"], ws)

        try:
            while True:
                # We don't expect client messages for now, but keep connection alive
                data = await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(list_id, user["id"], ws)
    finally:
        await db.close()
