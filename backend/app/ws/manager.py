import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # list_id -> list of (user_id, websocket)
        self.connections: dict[str, list[tuple[str, WebSocket]]] = defaultdict(list)

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
        user_ids = list({uid for uid, _ in self.connections.get(list_id, [])})
        await self.broadcast(list_id, {"type": "presence", "user_ids": user_ids})


manager = ConnectionManager()
