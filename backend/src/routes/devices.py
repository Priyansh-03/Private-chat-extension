from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.device import DeviceRegisterOut, PublicKeyIn
from src.routes.deps import get_db
from src.services.auth import generate_token, hash_token

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


@router.post("/register", response_model=DeviceRegisterOut)
async def register_device(body: PublicKeyIn, db: AsyncIOMotorDatabase = Depends(get_db)) -> DeviceRegisterOut:
    device_id = str(uuid4())
    token = generate_token()
    now = datetime.now(timezone.utc)
    await db.devices.insert_one(
        {
            "_id": device_id,
            "public_key": body.public_key,
            "auth_token_hash": hash_token(token),
            "created_at": now,
            "last_seen_at": now,
        }
    )
    return DeviceRegisterOut(device_id=device_id, auth_token=token)
