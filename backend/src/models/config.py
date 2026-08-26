from pydantic import BaseModel


class ConfigOut(BaseModel):
    quick_replies: list[str]
    message_char_limit: int
    feature_flags: dict[str, bool]
    invite_code_ttl_minutes: int
