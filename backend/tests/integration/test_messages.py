from tests.integration.conftest import auth_headers, drain_until, register_device


def _pair(client, a: dict, b: dict) -> None:
    code = client.post("/api/v1/pairing/invite", headers=auth_headers(a["auth_token"])).json()["code"]
    client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "peer"},
        headers=auth_headers(b["auth_token"]),
    )


def _send(ws_sender, ws_recipient, recipient_id: str, message_id: str, ciphertext: str) -> None:
    ws_sender.send_json(
        {"type": "chat:outgoing", "contactId": recipient_id, "messageId": message_id, "ciphertext": ciphertext, "nonce": "n"}
    )
    drain_until(ws_recipient, "chat:incoming")
    drain_until(ws_sender, "chat:ack")


def test_history_is_empty_for_a_new_pairing(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    history = client.get(f"/api/v1/messages/{b['device_id']}", headers=auth_headers(a["auth_token"])).json()
    assert history == []


def test_history_returns_both_directions_in_chronological_order(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        with client.websocket_connect("/ws") as ws_b:
            ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})
            _send(ws_a, ws_b, b["device_id"], "m1", "first")
            _send(ws_b, ws_a, a["device_id"], "m2", "second")
            _send(ws_a, ws_b, b["device_id"], "m3", "third")
            ws_b.close()
        ws_a.close()

    a_history = client.get(f"/api/v1/messages/{b['device_id']}", headers=auth_headers(a["auth_token"])).json()
    assert [(m["message_id"], m["direction"]) for m in a_history] == [
        ("m1", "outgoing"),
        ("m2", "incoming"),
        ("m3", "outgoing"),
    ]

    # Same conversation, other side — same messages, directions flipped.
    b_history = client.get(f"/api/v1/messages/{a['device_id']}", headers=auth_headers(b["auth_token"])).json()
    assert [(m["message_id"], m["direction"]) for m in b_history] == [
        ("m1", "incoming"),
        ("m2", "outgoing"),
        ("m3", "incoming"),
    ]


def test_history_is_scoped_to_a_conversation_you_are_actually_part_of(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    c = register_device(client, b"c")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        with client.websocket_connect("/ws") as ws_b:
            ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})
            _send(ws_a, ws_b, b["device_id"], "m1", "secret")
            ws_b.close()
        ws_a.close()

    # c was never part of this conversation — asking for it returns empty, not an error or leak.
    history = client.get(f"/api/v1/messages/{b['device_id']}", headers=auth_headers(c["auth_token"])).json()
    assert history == []


def test_history_requires_auth(client):
    response = client.get("/api/v1/messages/some-device-id")
    assert response.status_code in (401, 422)


def test_history_survives_disconnect(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        with client.websocket_connect("/ws") as ws_b:
            ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})
            _send(ws_a, ws_b, b["device_id"], "m1", "before disconnect")
            ws_b.close()
        ws_a.close()

    client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))

    history = client.get(f"/api/v1/messages/{b['device_id']}", headers=auth_headers(a["auth_token"])).json()
    assert len(history) == 1
    assert history[0]["message_id"] == "m1"
