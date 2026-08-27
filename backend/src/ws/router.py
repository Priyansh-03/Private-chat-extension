import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from constants import WS_AUTH_TIMEOUT_SECONDS, WS_CLOSE_AUTH_INVALID, WS_CLOSE_AUTH_MALFORMED, WS_CLOSE_AUTH_TIMEOUT
from src.models.ws import AuthFrame, inbound_frame_adapter
from src.services.auth import hash_token
from src.services.presence import broadcast_presence
from src.ws.handlers import dispatch

router = APIRouter()


async def _close_quietly(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code=code)
    except RuntimeError:
        pass  # socket already closed by the client


async def _authenticate(websocket: WebSocket) -> str | None:
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=WS_AUTH_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        await _close_quietly(websocket, WS_CLOSE_AUTH_TIMEOUT)
        return None
    except WebSocketDisconnect:
        return None
    except ValueError:
        # receive_json's json.loads raises plain ValueError (JSONDecodeError) on non-JSON text —
        # a client sending garbage here shouldn't crash the connection handler.
        await _close_quietly(websocket, WS_CLOSE_AUTH_MALFORMED)
        return None

    try:
        frame = AuthFrame.model_validate(raw)
    except ValidationError:
        await _close_quietly(websocket, WS_CLOSE_AUTH_MALFORMED)
        return None

    db = websocket.app.state.db
    device = await db.devices.find_one({"auth_token_hash": hash_token(frame.auth_token)})
    if device is None:
        await _close_quietly(websocket, WS_CLOSE_AUTH_INVALID)
        return None

    return device["_id"]


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    device_id = await _authenticate(websocket)
    if device_id is None:
        return

    db = websocket.app.state.db
    manager = websocket.app.state.manager

    await manager.register(device_id, websocket)
    await db.devices.update_one({"_id": device_id}, {"$set": {"last_seen_at": datetime.now(timezone.utc)}})
    await broadcast_presence(device_id, "online", db, manager)

    try:
        while True:
            try:
                raw = await websocket.receive_json()
            except ValueError:
                continue  # non-JSON frame; ignore and keep listening, same as a bad-schema one
            # Transport-level, not a chat frame — handled before the InboundFrame union so it
            # doesn't need contact validation or dispatch. Client sends this periodically to
            # detect a half-dead connection (see extension/src/background/backendTransport.ts);
            # this reply is all it needs.
            if isinstance(raw, dict) and raw.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            try:
                frame = inbound_frame_adapter.validate_python(raw)
            except ValidationError:
                continue
            await dispatch(device_id, frame, db, manager)
    except WebSocketDisconnect:
        pass
    finally:
        manager.unregister(device_id, websocket)
        await broadcast_presence(device_id, "offline", db, manager)
