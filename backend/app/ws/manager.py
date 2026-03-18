import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # list_id -> list of (user_id, websocket)
        self.connections: dict[str, list[tuple[str, WebSocket]]] = defaultdict(list)
        # Global connections for list-level events: list of (user_id, websocket)
        self.global_connections: list[tuple[str, WebSocket]] = []
        # Cache user info for presence: user_id -> {name, avatar_url}
        self.user_info: dict[str, dict] = {}

    def register_user(self, user: dict):
        self.user_info[user["id"]] = {
            "name": user.get("name", ""),
            "avatar_url": user.get("avatar_url"),
        }

    async def connect(self, list_id: str, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections[list_id].append((user_id, ws))
        # Broadcast presence update
        await self.broadcast_presence(list_id)

    async def disconnect(self, list_id: str, user_id: str, ws: WebSocket):
        self.connections[list_id] = [
            (uid, w) for uid, w in self.connections[list_id] if w is not ws
        ]
        if not self.connections[list_id]:
            del self.connections[list_id]
        else:
            await self.broadcast_presence(list_id)

    async def connect_global(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.global_connections.append((user_id, ws))

    async def disconnect_global(self, ws: WebSocket):
        self.global_connections = [(uid, w) for uid, w in self.global_connections if w is not ws]

    async def broadcast_global(self, message: dict, exclude_user: str | None = None):
        dead = []
        for user_id, ws in self.global_connections:
            if user_id == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((user_id, ws))
        for item in dead:
            self.global_connections.remove(item)

    async def broadcast(self, list_id: str, message: dict, exclude_user: str | None = None):
        if list_id not in self.connections:
            return
        dead = []
        for user_id, ws in self.connections[list_id]:
            if user_id == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((user_id, ws))
        for item in dead:
            self.connections[list_id].remove(item)

    async def broadcast_presence(self, list_id: str):
        seen = set()
        users = []
        for uid, _ in self.connections.get(list_id, []):
            if uid not in seen:
                seen.add(uid)
                info = self.user_info.get(uid, {})
                users.append({
                    "id": uid,
                    "name": info.get("name", ""),
                    "avatar_url": info.get("avatar_url"),
                })
        await self.broadcast(list_id, {"type": "presence", "users": users})


manager = ConnectionManager()
