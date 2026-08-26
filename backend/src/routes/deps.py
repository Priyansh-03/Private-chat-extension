from fastapi import Header, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.services.auth import hash_token
from src.ws.manager import ConnectionManager


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_manager(request: Request) -> ConnectionManager:
    return request.app.state.manager


async def get_current_device_id(
    request: Request,
    authorization: str = Header(...),
) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    db = get_db(request)
    device = await db.devices.find_one({"auth_token_hash": hash_token(token)})
    if device is None:
        raise HTTPException(status_code=401, detail="Invalid or unknown token")
    return device["_id"]
