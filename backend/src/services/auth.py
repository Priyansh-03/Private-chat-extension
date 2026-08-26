import hashlib
import hmac
import secrets

from constants import AUTH_TOKEN_BYTES


def generate_token() -> str:
    return secrets.token_urlsafe(AUTH_TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)
