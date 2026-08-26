def test_get_config_returns_defaults_without_auth(client):
    response = client.get("/api/v1/config")
    assert response.status_code == 200
    body = response.json()
    assert body["quick_replies"]
    assert body["message_char_limit"] > 0
    assert isinstance(body["feature_flags"], dict)
    assert body["invite_code_ttl_minutes"] > 0
