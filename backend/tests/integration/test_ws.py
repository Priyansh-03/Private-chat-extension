import pytest
from starlette.websockets import WebSocketDisconnect

from tests.integration.conftest import auth_headers, drain_until, register_device


def _pair(client, inviter: dict, acceptor: dict) -> None:
    code = client.post("/api/v1/pairing/invite", headers=auth_headers(inviter["auth_token"])).json()["code"]
    response = client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "peer"},
        headers=auth_headers(acceptor["auth_token"]),
    )
    assert response.status_code == 200, response.text


def test_ws_rejects_invalid_token(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "auth", "auth_token": "not-a-real-token"})
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_ws_rejects_malformed_auth_frame(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "not-auth"})
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_ping_gets_a_pong(client):
    a = register_device(client, b"a")
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "auth", "auth_token": a["auth_token"]})
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}
        ws.close()


def test_chat_outgoing_relayed_live_when_recipient_connected(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_b:
        ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})

        with client.websocket_connect("/ws") as ws_a:
            ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})

            ws_a.send_json(
                {
                    "type": "chat:outgoing",
                    "contactId": b["device_id"],
                    "messageId": "msg-1",
                    "ciphertext": "cipher",
                    "nonce": "nonce",
                }
            )

            incoming = drain_until(ws_b, "chat:incoming")
            assert incoming["contactId"] == a["device_id"]
            assert incoming["message"] == {"id": "msg-1", "ciphertext": "cipher", "nonce": "nonce"}

            ack = drain_until(ws_a, "chat:ack")
            assert ack == {"type": "chat:ack", "contactId": b["device_id"], "messageId": "msg-1"}

            ws_b.send_json({"type": "chat:delivered-ack", "contactId": a["device_id"], "messageId": "msg-1"})
            delivered = drain_until(ws_a, "chat:delivered")
            assert delivered == {"type": "chat:delivered", "contactId": b["device_id"], "messageId": "msg-1"}

            ws_b.send_json({"type": "chat:read-ack", "contactId": a["device_id"], "messageId": "msg-1", "readAt": 123})
            read = drain_until(ws_a, "chat:read")
            assert read == {"type": "chat:read", "contactId": b["device_id"], "messageId": "msg-1", "readAt": 123}

            ws_a.send_json({"type": "chat:typing", "contactId": b["device_id"], "state": "typing"})
            typing = drain_until(ws_b, "chat:remote-typing")
            assert typing == {"type": "chat:remote-typing", "contactId": a["device_id"], "state": "typing"}

            ws_a.close()
            ws_b.close()


def test_chat_outgoing_returns_pending_when_recipient_offline(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        ws_a.send_json(
            {
                "type": "chat:outgoing",
                "contactId": b["device_id"],
                "messageId": "msg-2",
                "ciphertext": "cipher",
                "nonce": "nonce",
            }
        )
        pending = drain_until(ws_a, "chat:pending")
        assert pending == {"type": "chat:pending", "contactId": b["device_id"], "messageId": "msg-2"}
        ws_a.close()


def test_chat_outgoing_ignored_for_non_contact(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    # deliberately not paired

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        ws_a.send_json(
            {
                "type": "chat:outgoing",
                "contactId": b["device_id"],
                "messageId": "msg-3",
                "ciphertext": "cipher",
                "nonce": "nonce",
            }
        )
        ws_a.close()


def test_chat_outgoing_ignored_after_contact_deleted(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    delete = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert delete.status_code == 204

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        ws_a.send_json(
            {
                "type": "chat:outgoing",
                "contactId": b["device_id"],
                "messageId": "msg-4",
                "ciphertext": "cipher",
                "nonce": "nonce",
            }
        )
        ws_a.close()


def test_presence_not_broadcast_after_contact_deleted(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    delete = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert delete.status_code == 204

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})

        with client.websocket_connect("/ws") as ws_b:
            ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})
            # a deleted b, so a's connection must not receive presence for b going online.
            ws_b.close()

        ws_a.close()


def test_chat_outgoing_from_the_disconnected_party_is_still_blocked(client):
    # a disconnects b; b (who never removed a) tries to message a anyway. Must still be silently
    # dropped — this is the actual mutual-block guarantee: a one-sided DELETE only ever deletes
    # the caller's own row, so without checking the recipient's row too, b's message would still
    # be relayed and delivered to a, defeating the point of a's disconnect entirely.
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    delete = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert delete.status_code == 204

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})

        with client.websocket_connect("/ws") as ws_b:
            ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})
            ws_b.send_json(
                {
                    "type": "chat:outgoing",
                    "contactId": a["device_id"],
                    "messageId": "msg-5",
                    "ciphertext": "cipher",
                    "nonce": "nonce",
                }
            )
            ws_b.close()

        ws_a.close()


def test_presence_not_broadcast_to_a_peer_you_disconnected(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    delete = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert delete.status_code == 204

    with client.websocket_connect("/ws") as ws_b:
        ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})

        with client.websocket_connect("/ws") as ws_a:
            ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
            # b still has a in their own list (only a's row was deleted), so ordinarily b would
            # get a presence:contact for a going online here — must not, since a disconnected b.
            ws_a.close()

        ws_b.close()


def test_presence_broadcast_on_connect_and_disconnect(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})

        with client.websocket_connect("/ws") as ws_b:
            ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})

            online = drain_until(ws_a, "presence:contact")
            assert online == {"type": "presence:contact", "contactId": b["device_id"], "status": "online"}

            # Close explicitly and read the resulting event *before* letting this
            # `with` block's __exit__ run — TestClient's websocket teardown can
            # otherwise deadlock against the server task still doing async work
            # (broadcasting presence) after the disconnect it's waiting to observe.
            ws_b.close()
            offline = drain_until(ws_a, "presence:contact")
            assert offline == {"type": "presence:contact", "contactId": b["device_id"], "status": "offline"}

        ws_a.close()
