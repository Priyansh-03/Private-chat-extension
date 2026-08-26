from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter


class AuthFrame(BaseModel):
    type: Literal["auth"]
    auth_token: str


class ChatOutgoingFrame(BaseModel):
    type: Literal["chat:outgoing"]
    contactId: str
    messageId: str
    ciphertext: str
    nonce: str


class ChatDeliveredAckFrame(BaseModel):
    type: Literal["chat:delivered-ack"]
    contactId: str
    messageId: str


class ChatReadAckFrame(BaseModel):
    type: Literal["chat:read-ack"]
    contactId: str
    messageId: str
    readAt: int


class ChatTypingFrame(BaseModel):
    type: Literal["chat:typing"]
    contactId: str
    state: Literal["idle", "typing"]


InboundFrame = Annotated[
    Union[ChatOutgoingFrame, ChatDeliveredAckFrame, ChatReadAckFrame, ChatTypingFrame],
    Field(discriminator="type"),
]

inbound_frame_adapter: TypeAdapter[InboundFrame] = TypeAdapter(InboundFrame)
