from tests.integration.conftest import auth_headers, drain_until, register_device, run_db


def _pair(client, a: dict, b: dict) -> None:
    code = client.post("/api/v1/pairing/invite", headers=auth_headers(a["auth_token"])).json()["code"]
    client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "peer"},
        headers=auth_headers(b["auth_token"]),
    )


def test_message_is_persisted_as_ciphertext_only(client):
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
                    "messageId": "msg-x",
                    "ciphertext": "the-ciphertext",
                    "nonce": "the-nonce",
                }
            )
            drain_until(ws_b, "chat:incoming")
            drain_until(ws_a, "chat:ack")
            ws_a.close()
        ws_b.close()

    async def _find(db) -> dict:
        return await db.messages.find_one({"_id": "msg-x"})

    doc = run_db(_find)
    assert doc is not None
    assert doc["ciphertext"] == "the-ciphertext"
    assert doc["nonce"] == "the-nonce"
    # The server only ever stores what it was handed — no plaintext-carrying field exists at all,
    # so there's nothing here that could leak the message content even by a future bug elsewhere
    # in this handler.
    assert set(doc.keys()) == {"_id", "sender_device_id", "recipient_device_id", "ciphertext", "nonce", "created_at"}


def test_message_history_survives_recipient_offline(client):
    # The old behavior here was "nothing was queued" for an offline recipient — this is the
    # replacement: the message is durably stored regardless, and shows up via GET /messages
    # once the recipient (or a fresh tab of theirs) asks for history.
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_a:
        ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
        ws_a.send_json(
            {
                "type": "chat:outgoing",
                "contactId": b["device_id"],
                "messageId": "msg-offline",
                "ciphertext": "cipher",
                "nonce": "nonce",
            }
        )
        drain_until(ws_a, "chat:pending")
        ws_a.close()

    history = client.get(f"/api/v1/messages/{a['device_id']}", headers=auth_headers(b["auth_token"])).json()
    assert len(history) == 1
    assert history[0]["message_id"] == "msg-offline"
    assert history[0]["direction"] == "incoming"


def test_nothing_deleted_after_full_flow(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    code = client.post("/api/v1/pairing/invite", headers=auth_headers(a["auth_token"])).json()["code"]
    client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "peer"},
        headers=auth_headers(b["auth_token"]),
    )

    async def _counts(db) -> dict[str, int]:
        return {
            "devices": await db.devices.count_documents({}),
            "invites": await db.invites.count_documents({}),
            "contacts": await db.contacts.count_documents({}),
        }

    counts = run_db(_counts)
    assert counts == {"devices": 2, "invites": 1, "contacts": 2}

    async def _invite(db) -> dict:
        return await db.invites.find_one({"_id": code})

    invite = run_db(_invite)
    assert invite["status"] == "used"
