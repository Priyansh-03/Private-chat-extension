from src.services.auth import generate_token, hash_token, tokens_match


def test_generate_token_is_unique_and_url_safe():
    a, b = generate_token(), generate_token()
    assert a != b
    assert all(c.isalnum() or c in "-_" for c in a)


def test_hash_token_is_deterministic():
    token = generate_token()
    assert hash_token(token) == hash_token(token)


def test_tokens_match_accepts_correct_token():
    token = generate_token()
    assert tokens_match(token, hash_token(token)) is True


def test_tokens_match_rejects_wrong_token():
    token = generate_token()
    other = generate_token()
    assert tokens_match(other, hash_token(token)) is False
