from datetime import datetime

from pydantic import BaseModel


class MessageOut(BaseModel):
    message_id: str
    direction: str  # "outgoing" | "incoming", relative to the requesting device
    ciphertext: str
    nonce: str
    created_at: datetime
    delivered_at: datetime | None = None
    read_at: datetime | None = None
