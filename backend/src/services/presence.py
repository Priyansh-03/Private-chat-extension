from motor.motor_asyncio import AsyncIOMotorDatabase

from src.ws.manager import ConnectionManager


async def broadcast_presence(device_id: str, status: str, db: AsyncIOMotorDatabase, manager: ConnectionManager) -> None:
    cursor = db.contacts.find({"peer_device_id": device_id, "deleted_at": None}, {"owner_device_id": 1})
    async for contact in cursor:
        owner_id = contact["owner_device_id"]
        # Mutual check, same as chat delivery (see ws/handlers.py's _is_contact): if `device_id`
        # disconnected `owner_id`, stop pushing them live presence about `device_id` too, even
        # though `owner_id` never removed the contact from their own list.
        reverse = await db.contacts.find_one({"owner_device_id": device_id, "peer_device_id": owner_id, "deleted_at": None})
        if reverse is None:
            continue
        await manager.send(owner_id, {"type": "presence:contact", "contactId": device_id, "status": status})
