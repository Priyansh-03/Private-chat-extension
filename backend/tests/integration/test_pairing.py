from datetime import datetime, timedelta, timezone

from tests.integration.conftest import auth_headers, register_device, run_db


def test_full_pairing_flow_creates_bidirectional_contacts(client):
    inviter = register_device(client, b"a")
    acceptor = register_device(client, b"b")

    invite = client.post("/api/v1/pairing/invite", headers=auth_headers(inviter["auth_token"]))
    assert invite.status_code == 200, invite.text
    code = invite.json()["code"]

    accept = client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "Alex"},
        headers=auth_headers(acceptor["auth_token"]),
    )
    assert accept.status_code == 200, accept.text
    assert accept.json()["device_id"] == inviter["device_id"]

    acceptor_contacts = client.get("/api/v1/contacts", headers=auth_headers(acceptor["auth_token"])).json()
    assert len(acceptor_contacts) == 1
    assert acceptor_contacts[0]["device_id"] == inviter["device_id"]
    assert acceptor_contacts[0]["display_name"] == "Alex"

    inviter_contacts = client.get("/api/v1/contacts", headers=auth_headers(inviter["auth_token"])).json()
    assert len(inviter_contacts) == 1
    assert inviter_contacts[0]["device_id"] == acceptor["device_id"]


def test_accept_unknown_code_returns_404(client):
    acceptor = register_device(client, b"b")
    response = client.post(
        "/api/v1/pairing/accept",
        json={"code": "NOTREAL1", "display_name": "X"},
        headers=auth_headers(acceptor["auth_token"]),
    )
    assert response.status_code == 404


def test_accept_used_code_cannot_be_reused(client):
    inviter = register_device(client, b"a")
    acceptor = register_device(client, b"b")
    third = register_device(client, b"c")

    code = client.post("/api/v1/pairing/invite", headers=auth_headers(inviter["auth_token"])).json()["code"]
    first = client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "Alex"},
        headers=auth_headers(acceptor["auth_token"]),
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "Alex"},
        headers=auth_headers(third["auth_token"]),
    )
    assert second.status_code == 404


def test_expired_invite_is_rejected_but_not_deleted(client):
    inviter = register_device(client, b"a")
    acceptor = register_device(client, b"b")

    code = client.post("/api/v1/pairing/invite", headers=auth_headers(inviter["auth_token"])).json()["code"]

    async def _expire(db) -> None:
        await db.invites.update_one(
            {"_id": code}, {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}}
        )

    run_db(_expire)

    response = client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": "Alex"},
        headers=auth_headers(acceptor["auth_token"]),
    )
    assert response.status_code == 410

    async def _still_present(db) -> dict:
        return await db.invites.find_one({"_id": code})

    doc = run_db(_still_present)
    assert doc is not None
    assert doc["status"] == "pending"


def test_pairing_requires_auth(client):
    response = client.post("/api/v1/pairing/invite")
    assert response.status_code in (401, 422)


def _pair(client, inviter: dict, acceptor: dict, display_name: str = "Alex") -> None:
    code = client.post("/api/v1/pairing/invite", headers=auth_headers(inviter["auth_token"])).json()["code"]
    response = client.post(
        "/api/v1/pairing/accept",
        json={"code": code, "display_name": display_name},
        headers=auth_headers(acceptor["auth_token"]),
    )
    assert response.status_code == 200, response.text


def test_a_fresh_pairing_shows_both_sides_connected(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    assert client.get("/api/v1/contacts", headers=auth_headers(a["auth_token"])).json()[0]["connected"] is True
    assert client.get("/api/v1/contacts", headers=auth_headers(b["auth_token"])).json()[0]["connected"] is True


def test_delete_contact_removes_it_from_callers_list_only(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    response = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert response.status_code == 204

    assert client.get("/api/v1/contacts", headers=auth_headers(a["auth_token"])).json() == []

    b_contacts = client.get("/api/v1/contacts", headers=auth_headers(b["auth_token"])).json()
    assert len(b_contacts) == 1
    assert b_contacts[0]["device_id"] == a["device_id"]


def test_delete_contact_marks_the_peer_as_disconnected_not_removed(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))

    # b keeps a in their own list — this is a mutual block, not a mutual removal — but sees them
    # as disconnected, since a's row (the one that actually mattered for delivery) is gone.
    b_contacts = client.get("/api/v1/contacts", headers=auth_headers(b["auth_token"])).json()
    assert len(b_contacts) == 1
    assert b_contacts[0]["device_id"] == a["device_id"]
    assert b_contacts[0]["connected"] is False


def test_delete_contact_soft_deletes_not_removes_document(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))

    async def _find(db) -> dict:
        return await db.contacts.find_one({"owner_device_id": a["device_id"], "peer_device_id": b["device_id"]})

    doc = run_db(_find)
    assert doc is not None
    assert doc["deleted_at"] is not None


def test_delete_unknown_contact_returns_404(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    # deliberately not paired

    response = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert response.status_code == 404


def test_delete_contact_requires_auth(client):
    response = client.delete("/api/v1/contacts/some-device-id")
    assert response.status_code in (401, 422)


def test_rename_contact_persists_across_a_fresh_contacts_fetch(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b, display_name="Alex")

    response = client.patch(
        f"/api/v1/contacts/{b['device_id']}",
        json={"display_name": "Alexander"},
        headers=auth_headers(a["auth_token"]),
    )
    assert response.status_code == 204

    a_contacts = client.get("/api/v1/contacts", headers=auth_headers(a["auth_token"])).json()
    assert a_contacts[0]["display_name"] == "Alexander"

    # b's own row (a separate document — b's name for a, set during accept) is untouched —
    # rename is one-sided, like disconnect.
    b_contacts = client.get("/api/v1/contacts", headers=auth_headers(b["auth_token"])).json()
    assert b_contacts[0]["display_name"] == "Alex"


def test_rename_contact_rejects_empty_name(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    response = client.patch(
        f"/api/v1/contacts/{b['device_id']}",
        json={"display_name": "   "},
        headers=auth_headers(a["auth_token"]),
    )
    assert response.status_code == 400


def test_rename_unknown_contact_returns_404(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    # deliberately not paired

    response = client.patch(
        f"/api/v1/contacts/{b['device_id']}",
        json={"display_name": "New Name"},
        headers=auth_headers(a["auth_token"]),
    )
    assert response.status_code == 404


def test_rename_contact_requires_auth(client):
    response = client.patch("/api/v1/contacts/some-device-id", json={"display_name": "New Name"})
    assert response.status_code in (401, 422)


def test_repairing_after_delete_restores_contact(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b, display_name="Alex")

    client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert client.get("/api/v1/contacts", headers=auth_headers(a["auth_token"])).json() == []

    _pair(client, a, b, display_name="Alex Again")

    # a's own row (inviter side) is revived by clearing deleted_at again.
    a_contacts = client.get("/api/v1/contacts", headers=auth_headers(a["auth_token"])).json()
    assert len(a_contacts) == 1
    assert a_contacts[0]["device_id"] == b["device_id"]

    # b's row (acceptor side, never deleted) picks up the freshly-submitted display name,
    # confirming the upsert updates an existing un-deleted doc rather than erroring. It's also
    # connected again now that a's row is revived too.
    b_contacts = client.get("/api/v1/contacts", headers=auth_headers(b["auth_token"])).json()
    assert b_contacts[0]["display_name"] == "Alex Again"
    assert b_contacts[0]["connected"] is True


def test_delete_contact_pushes_a_live_disconnect_to_the_peer(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    with client.websocket_connect("/ws") as ws_b:
        ws_b.send_json({"type": "auth", "auth_token": b["auth_token"]})

        response = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
        assert response.status_code == 204

        frame = ws_b.receive_json()
        assert frame == {"type": "contact:disconnected", "contactId": a["device_id"]}
        ws_b.close()


def test_delete_contact_does_not_push_when_peer_is_offline(client):
    a = register_device(client, b"a")
    b = register_device(client, b"b")
    _pair(client, a, b)

    # No assertion beyond "this doesn't raise" — manager.send() on an offline device is a no-op
    # (see ws/manager.py), this just exercises that path explicitly rather than only implicitly.
    response = client.delete(f"/api/v1/contacts/{b['device_id']}", headers=auth_headers(a["auth_token"]))
    assert response.status_code == 204
