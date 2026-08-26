from tests.integration.conftest import auth_headers, drain_until, register_device, run_db


def test_no_message_ever_written_to_mongo(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")

    code = client.post("/api/v1/pairing/invite", headers=auth_headers(a["auth_token"])).json()["code"]
    client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "peer"},
        headers=auth_headers(b["auth_token"]),
    )

    with client.websocket_connect("/ws") as ws_b:
        ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})
        with client.websocket_connect("/ws") as ws_a:
            ws_a.send_json({"type": "auth", "auth_token": a["auth_token"]})
            ws_a.send_json(
                {
                    "type": "chat:outgoing",
                    "contactId": b["device_id"],
                    "messageId": "msg-x",
                    "ciphertext": "cipher",
                    "nonce": "nonce",
                }
            )
            drain_until(ws_b, "chat:incoming")
            drain_until(ws_a, "chat:ack")
            ws_a.close()
        ws_b.close()

    async def _collection_names(db) -> list[str]:
        return await db.list_collection_names()

    names = run_db(_collection_names)
    assert "messages" not in names


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
