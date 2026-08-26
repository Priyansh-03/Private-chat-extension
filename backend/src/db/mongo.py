from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from constants import DEFAULT_CONFIG_DOCUMENT
from src.config import settings


def create_client() -> AsyncIOMotorClient:
    return AsyncIOMotorClient(settings.mongodb_uri, tz_aware=True)


def get_database(client: AsyncIOMotorClient) -> AsyncIOMotorDatabase:
    return client[settings.mongodb_db_name]


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.devices.create_index("auth_token_hash", unique=True)
    await db.contacts.create_index([("owner_device_id", 1), ("peer_device_id", 1)], unique=True)
    await db.contacts.create_index("peer_device_id")


async def seed_default_config(db: AsyncIOMotorDatabase) -> None:
    await db.config.update_one({"_id": DEFAULT_CONFIG_DOCUMENT["_id"]}, {"$setOnInsert": DEFAULT_CONFIG_DOCUMENT}, upsert=True)
