import base64

from pydantic import BaseModel, field_validator

from constants import PUBLIC_KEY_BYTES


class PublicKeyIn(BaseModel):
    public_key: str

    @field_validator("public_key")
    @classmethod
    def validate_public_key(cls, value: str) -> str:
        try:
            decoded = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("public_key must be valid base64") from exc
        if len(decoded) != PUBLIC_KEY_BYTES:
            raise ValueError(f"public_key must decode to {PUBLIC_KEY_BYTES} bytes")
        return value


class DeviceRegisterOut(BaseModel):
    device_id: str
    auth_token: str
