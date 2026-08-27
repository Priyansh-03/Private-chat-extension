from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from constants import MESSAGE_HISTORY_LIMIT
from src.models.messages import MessageOut
from src.routes.deps import get_current_device_id, get_db

router = APIRouter(prefix="/api/v1", tags=["messages"])


@router.get("/messages/{contact_id}", response_model=list[MessageOut])
async def get_message_history(
    contact_id: str,
    device_id: str = Depends(get_current_device_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[MessageOut]:
    # Scoped to the caller by construction — every match has device_id on one side, so this can
    # only ever return a conversation the caller was actually part of. History survives a
    # disconnect on either side (this only reads db.messages, never db.contacts) — same as
    # keeping old texts around after unfriending someone.
    # Sort newest-first to make `limit` keep the most recent window, then reverse back to
    # chronological order for the response — sorting ascending-then-limiting would instead keep
    # the *oldest* messages once a conversation passes the limit.
    cursor = (
        db.messages.find(
            {
                "$or": [
                    {"sender_device_id": device_id, "recipient_device_id": contact_id},
                    {"sender_device_id": contact_id, "recipient_device_id": device_id},
                ]
            }
        )
        .sort("created_at", -1)
        .limit(MESSAGE_HISTORY_LIMIT)
    )
    messages = [
        MessageOut(
            message_id=message["_id"],
            direction="outgoing" if message["sender_device_id"] == device_id else "incoming",
            ciphertext=message["ciphertext"],
            nonce=message["nonce"],
            created_at=message["created_at"],
            delivered_at=message.get("delivered_at"),
            read_at=message.get("read_at"),
        )
        async for message in cursor
    ]
    messages.reverse()
    return messages
