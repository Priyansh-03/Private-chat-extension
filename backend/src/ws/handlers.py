from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from src.models.ws import ChatDeliveredAckFrame, ChatOutgoingFrame, ChatReadAckFrame, ChatTypingFrame, InboundFrame
from src.ws.manager import ConnectionManager


async def _is_contact(db: AsyncIOMotorDatabase, owner_device_id: str, peer_device_id: str) -> bool:
    contact = await db.contacts.find_one(
        {"owner_device_id": owner_device_id, "peer_device_id": peer_device_id, "deleted_at": None}
    )
    return contact is not None


async def _handle_chat_outgoing(sender_id: str, frame: ChatOutgoingFrame, db: AsyncIOMotorDatabase, manager: ConnectionManager) -> None:
    # Both directions must be active: sender->recipient (an ordinary non-contact check) AND
    # recipient->sender (blocks delivery once the recipient has disconnected the sender — a
    # one-sided Disconnect only deletes the disconnecter's own row, so without this second check
    # the disconnected party could still message the person who disconnected them and have it
    # actually delivered). Same "no error frame" treatment either way — don't leak which case it was.
    if not await _is_contact(db, sender_id, frame.contactId) or not await _is_contact(db, frame.contactId, sender_id):
        return

    # Persisted as ciphertext only — the server never has the key material to decrypt this,
    # only the two devices do (see crypto.ts). This is the durable copy every tab/device reads
    # history from (GET /messages/{contact_id}), replacing the old "nothing was queued" behavior
    # for an offline recipient below.
    try:
        await db.messages.insert_one(
            {
                "_id": frame.messageId,
                "sender_device_id": sender_id,
                "recipient_device_id": frame.contactId,
                "ciphertext": frame.ciphertext,
                "nonce": frame.nonce,
                "created_at": datetime.now(timezone.utc),
            }
        )
    except DuplicateKeyError:
        pass  # already persisted (e.g. a client retry after a dropped ack) — still relay below

    delivered_live = await manager.send(
        frame.contactId,
        {
            "type": "chat:incoming",
            "contactId": sender_id,
            "message": {"id": frame.messageId, "ciphertext": frame.ciphertext, "nonce": frame.nonce},
        },
    )
    ack_type = "chat:ack" if delivered_live else "chat:pending"
    await manager.send(sender_id, {"type": ack_type, "contactId": frame.contactId, "messageId": frame.messageId})


async def _handle_delivered_ack(sender_id: str, frame: ChatDeliveredAckFrame, manager: ConnectionManager) -> None:
    await manager.send(frame.contactId, {"type": "chat:delivered", "contactId": sender_id, "messageId": frame.messageId})


async def _handle_read_ack(sender_id: str, frame: ChatReadAckFrame, manager: ConnectionManager) -> None:
    await manager.send(
        frame.contactId,
        {"type": "chat:read", "contactId": sender_id, "messageId": frame.messageId, "readAt": frame.readAt},
    )


async def _handle_typing(sender_id: str, frame: ChatTypingFrame, manager: ConnectionManager) -> None:
    await manager.send(frame.contactId, {"type": "chat:remote-typing", "contactId": sender_id, "state": frame.state})


async def dispatch(sender_id: str, frame: InboundFrame, db: AsyncIOMotorDatabase, manager: ConnectionManager) -> None:
    if isinstance(frame, ChatOutgoingFrame):
        await _handle_chat_outgoing(sender_id, frame, db, manager)
    elif isinstance(frame, ChatDeliveredAckFrame):
        await _handle_delivered_ack(sender_id, frame, manager)
    elif isinstance(frame, ChatReadAckFrame):
        await _handle_read_ack(sender_id, frame, manager)
    elif isinstance(frame, ChatTypingFrame):
        await _handle_typing(sender_id, frame, manager)
