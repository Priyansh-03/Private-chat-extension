from constants import INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH
from src.routes.pairing import _generate_code


def test_generated_code_has_expected_length():
    code = _generate_code()
    assert len(code) == INVITE_CODE_LENGTH


def test_generated_code_uses_only_allowed_alphabet():
    code = _generate_code()
    assert all(c in INVITE_CODE_ALPHABET for c in code)


def test_generated_codes_are_not_all_identical():
    codes = {_generate_code() for _ in range(20)}
    assert len(codes) > 1
