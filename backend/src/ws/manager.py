from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def register(self, device_id: str, websocket: WebSocket) -> None:
        # Claim the slot before awaiting anything — two concurrent register() calls for the same
        # device_id would otherwise both read the same `existing` value across the `await
        # close()` below, and whichever wrote last would silently orphan the other connection
        # (never tracked, never cleaned up by unregister's identity check).
        previous = self._connections.get(device_id)
        self._connections[device_id] = websocket
        if previous is not None and previous is not websocket:
            await previous.close()

    def unregister(self, device_id: str, websocket: WebSocket) -> None:
        if self._connections.get(device_id) is websocket:
            del self._connections[device_id]

    def is_online(self, device_id: str) -> bool:
        return device_id in self._connections

    async def send(self, device_id: str, payload: dict[str, Any]) -> bool:
        websocket = self._connections.get(device_id)
        if websocket is None:
            return False
        await websocket.send_json(payload)
        return True
