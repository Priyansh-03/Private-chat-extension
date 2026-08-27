from datetime import datetime

from pydantic import BaseModel


class InviteOut(BaseModel):
    code: str
    expires_at: datetime


class AcceptIn(BaseModel):
    code: str
    display_name: str


class AcceptOut(BaseModel):
    device_id: str
    public_key: str
    display_name: str


class RenameContactIn(BaseModel):
    display_name: str


class ContactOut(BaseModel):
    device_id: str
    display_name: str
    public_key: str
    status: str
    # False once the *other* side has disconnected you (their row toward you is soft-deleted) —
    # you keep them in your own list until you remove them too, but can no longer chat.
    connected: bool
