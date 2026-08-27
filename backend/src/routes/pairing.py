import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from constants import INVITE_CODE_ALPHABET, INVITE_CODE_GENERATION_ATTEMPTS, INVITE_CODE_LENGTH
from src.config import settings
from src.models.pairing import AcceptIn, AcceptOut, ContactOut, InviteOut, RenameContactIn
from src.routes.deps import get_current_device_id, get_db, get_manager
from src.ws.manager import ConnectionManager

router = APIRouter(prefix="/api/v1", tags=["pairing"])


def _generate_code() -> str:
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))


@router.post("/pairing/invite", response_model=InviteOut)
async def create_invite(
    device_id: str = Depends(get_current_device_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> InviteOut:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.invite_code_ttl_minutes)
    for _ in range(INVITE_CODE_GENERATION_ATTEMPTS):
        code = _generate_code()
        try:
            await db.invites.insert_one(
                {"_id": code, "device_id": device_id, "expires_at": expires_at, "status": "pending"}
            )
            return InviteOut(code=code, expires_at=expires_at)
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=500, detail="Could not generate a unique invite code")


@router.post("/pairing/accept", response_model=AcceptOut)
async def accept_invite(
    body: AcceptIn,
    acceptor_device_id: str = Depends(get_current_device_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    manager: ConnectionManager = Depends(get_manager),
) -> AcceptOut:
    now = datetime.now(timezone.utc)

    # Read-only peek so a self-pairing attempt fails without burning the code (the atomic claim
    # below can't distinguish "self-pairing" from "any other rejection reason" cheaply, and this
    # check doesn't need to be part of the same atomic operation — worst case under a race, the
    # claim below just correctly loses to whichever request gets there first).
    peek = await db.invites.find_one({"_id": body.code}, {"device_id": 1})
    if peek is not None and peek["device_id"] == acceptor_device_id:
        raise HTTPException(status_code=400, detail="Cannot pair with yourself")

    # Atomically claim the invite: the filter's status="pending" guard means only one of two
    # concurrent accept requests for the same code can ever succeed here — without this, both
    # could read "pending" before either writes "used", and the code would end up paired with
    # two different acceptors.
    invite = await db.invites.find_one_and_update(
        {"_id": body.code, "status": "pending", "expires_at": {"$gt": now}},
        {"$set": {"status": "used"}},
    )
    if invite is None:
        existing = await db.invites.find_one({"_id": body.code})
        if existing is not None and existing["status"] == "pending":
            raise HTTPException(status_code=410, detail="Invite code expired")
        raise HTTPException(status_code=404, detail="Invite code not found or already used")

    inviter_device_id = invite["device_id"]
    inviter = await db.devices.find_one({"_id": inviter_device_id})
    acceptor = await db.devices.find_one({"_id": acceptor_device_id})
    if inviter is None or acceptor is None:
        raise HTTPException(status_code=404, detail="Device not found")

    # Upsert rather than insert: re-pairing via a fresh invite after one side deleted the
    # contact must revive the existing doc (clearing deleted_at) instead of hitting the
    # unique index's DuplicateKeyError and silently no-op'ing.
    await db.contacts.update_one(
        {"owner_device_id": acceptor_device_id, "peer_device_id": inviter_device_id},
        {
            "$set": {
                "peer_public_key": inviter["public_key"],
                "display_name": body.display_name,
                "deleted_at": None,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    await db.contacts.update_one(
        {"owner_device_id": inviter_device_id, "peer_device_id": acceptor_device_id},
        {
            "$set": {
                "peer_public_key": acceptor["public_key"],
                "deleted_at": None,
            },
            "$setOnInsert": {"display_name": "", "created_at": now},
        },
        upsert=True,
    )

    if manager.is_online(inviter_device_id):
        await manager.send(
            inviter_device_id,
            {"type": "contact:added", "contactId": acceptor_device_id, "name": "", "publicKey": acceptor["public_key"]},
        )

    return AcceptOut(device_id=inviter_device_id, public_key=inviter["public_key"], display_name=body.display_name)


@router.get("/contacts", response_model=list[ContactOut])
async def list_contacts(
    device_id: str = Depends(get_current_device_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    manager: ConnectionManager = Depends(get_manager),
) -> list[ContactOut]:
    contacts = []
    async for contact in db.contacts.find({"owner_device_id": device_id, "deleted_at": None}):
        peer_id = contact["peer_device_id"]
        # connected requires the *peer's* row back toward this device to still be active too —
        # if they disconnected you, their row is soft-deleted and this comes back None. Chat
        # delivery enforces the same mutual check server-side (see ws/handlers.py's _is_contact),
        # this is just what lets the UI show it instead of messages silently going nowhere.
        reverse = await db.contacts.find_one({"owner_device_id": peer_id, "peer_device_id": device_id, "deleted_at": None})
        contacts.append(
            ContactOut(
                device_id=peer_id,
                display_name=contact["display_name"],
                public_key=contact["peer_public_key"],
                status="online" if manager.is_online(peer_id) else "offline",
                connected=reverse is not None,
            )
        )
    return contacts


@router.patch("/contacts/{peer_device_id}", status_code=204)
async def rename_contact(
    peer_device_id: str,
    body: RenameContactIn,
    device_id: str = Depends(get_current_device_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> None:
    # display_name is per-owner (each side's own local label for the other), same field
    # pairing/accept sets initially — this just lets it be changed later and have that change
    # survive across devices/reinstalls instead of living only in this browser's local storage.
    name = body.display_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    result = await db.contacts.update_one(
        {"owner_device_id": device_id, "peer_device_id": peer_device_id},
        {"$set": {"display_name": name}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")


@router.delete("/contacts/{peer_device_id}", status_code=204)
async def delete_contact(
    peer_device_id: str,
    device_id: str = Depends(get_current_device_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
    manager: ConnectionManager = Depends(get_manager),
) -> None:
    # Only the caller's own contact doc is marked deleted (peer keeps their row, and their own
    # Disconnect works the same way independently) — so a fresh invite/accept later revives both
    # sides via the upsert in accept_invite instead of needing to re-insert a purged row. But
    # deleting this row is also what the *other* side's connected/chat-delivery checks key off of
    # (see list_contacts and ws/handlers.py's _is_contact) — so from the peer's perspective this is
    # a real block: they keep you in their list, but see you as disconnected and can't message you.
    result = await db.contacts.update_one(
        {"owner_device_id": device_id, "peer_device_id": peer_device_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")

    if manager.is_online(peer_device_id):
        await manager.send(peer_device_id, {"type": "contact:disconnected", "contactId": device_id})
