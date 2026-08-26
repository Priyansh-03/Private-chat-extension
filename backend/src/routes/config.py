from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from constants import DEFAULT_CONFIG_DOCUMENT, DEFAULT_CONFIG_ID
from src.config import settings
from src.models.config import ConfigOut
from src.routes.deps import get_db

router = APIRouter(prefix="/api/v1", tags=["config"])


@router.get("/config", response_model=ConfigOut)
async def get_config(db: AsyncIOMotorDatabase = Depends(get_db)) -> ConfigOut:
    doc = await db.config.find_one({"_id": DEFAULT_CONFIG_ID}) or DEFAULT_CONFIG_DOCUMENT
    return ConfigOut.model_validate({**doc, "invite_code_ttl_minutes": settings.invite_code_ttl_minutes})
