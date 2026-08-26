import base64

import pytest
from pydantic import ValidationError

from src.models.device import PublicKeyIn


def test_accepts_valid_32_byte_base64_key():
    key = base64.b64encode(b"0" * 32).decode()
    model = PublicKeyIn(public_key=key)
    assert model.public_key == key


def test_rejects_wrong_length_key():
    key = base64.b64encode(b"0" * 16).decode()
    with pytest.raises(ValidationError):
        PublicKeyIn(public_key=key)


def test_rejects_non_base64_key():
    with pytest.raises(ValidationError):
        PublicKeyIn(public_key="not-valid-base64!!!")
