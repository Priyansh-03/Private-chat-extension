from tests.integration.conftest import register_device


def test_register_device_returns_id_and_token(client):
    device = register_device(client, b"a")
    assert device["device_id"]
    assert device["auth_token"]


def test_register_device_rejects_invalid_public_key(client):
    response = client.post("/api/v1/devices/register", json={"public_key": "not-base64!!"})
    assert response.status_code == 422


def test_register_device_rejects_wrong_length_key(client):
    import base64

    short_key = base64.b64encode(b"short").decode()
    response = client.post("/api/v1/devices/register", json={"public_key": short_key})
    assert response.status_code == 422


def test_two_registrations_get_different_ids(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    assert a["device_id"] != b["device_id"]
    assert a["auth_token"] != b["auth_token"]
