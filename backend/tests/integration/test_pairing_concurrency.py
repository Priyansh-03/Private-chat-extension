import threading

from tests.integration.conftest import auth_headers, register_device


def test_concurrent_accepts_of_same_code_only_one_wins(client):
    """Regression test for a TOCTOU race in accept_invite: two accept requests for the same code
    used to both read status="pending" before either wrote "used", so both could succeed and pair
    with the same inviter. The fix claims the invite atomically via find_one_and_update."""
    inviter = register_device(client, b"a")
    acceptors = [register_device(client, bytes([b])) for b in (2, 3, 4, 5)]
    code = client.post("/api/v1/pairing/invite", headers=auth_headers(inviter["auth_token"])).json()["code"]

    results: list[int] = []
    results_lock = threading.Lock()

    def attempt(acceptor: dict) -> None:
        response = client.post(
            "/api/v1/pairing/accept",
            json={"code": code, "display_name": "peer"},
            headers=auth_headers(acceptor["auth_token"]),
        )
        with results_lock:
            results.append(response.status_code)

    threads = [threading.Thread(target=attempt, args=(acceptor,)) for acceptor in acceptors]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert results.count(200) == 1, f"expected exactly one winner, got {results}"
    assert results.count(404) == len(acceptors) - 1

    inviter_contacts = client.get("/api/v1/contacts", headers=auth_headers(inviter["auth_token"])).json()
    assert len(inviter_contacts) == 1
