import asyncio
import base64

import pytest
from fastapi.testclient import TestClient
from motor.motor_asyncio import AsyncIOMotorClient

from src.config import settings
from src.main import app


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client

    async def _drop() -> None:
        cleanup_client = AsyncIOMotorClient(settings.mongodb_uri)
        await cleanup_client.drop_database(settings.mongodb_db_name)
        cleanup_client.close()

    asyncio.run(_drop())


def fake_public_key(seed: bytes = b"k") -> str:
    return base64.b64encode((seed * 32)[:32]).decode()


def register_device(client: TestClient, seed: bytes) -> dict:
    response = client.post("/api/v1/devices/register", json={"public_key": fake_public_key(seed)})
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def run_db(coro_fn):
    """Run a coroutine against a fresh Motor client scoped to its own event loop.

    The app's own `app.state.db` is bound to the event loop running inside
    TestClient's background portal thread; touching it via a separate
    `asyncio.run()` call from the test raises "attached to a different loop".
    A short-lived client per call sidesteps that — MongoDB itself doesn't care
    which client/loop issues the operation.
    """

    async def _run():
        test_client = AsyncIOMotorClient(settings.mongodb_uri, tz_aware=True)
        try:
            db = test_client[settings.mongodb_db_name]
            return await coro_fn(db)
        finally:
            test_client.close()

    return asyncio.run(_run())


def drain_until(ws, expected_type: str, max_frames: int = 5) -> dict:
    """Read frames until one of expected_type is found, tolerating interleaved
    presence:contact/contact:added frames whose exact arrival order across two
    independently-driven test connections isn't guaranteed."""
    frame = None
    for _ in range(max_frames):
        frame = ws.receive_json()
        if frame["type"] == expected_type:
            return frame
    raise AssertionError(f"expected a {expected_type!r} frame within {max_frames} frames, last was {frame!r}")
