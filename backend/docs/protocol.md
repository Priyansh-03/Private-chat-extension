# Backend protocol

This documents the REST + WebSocket contract as implemented, for the future extension
pass that replaces `mockTransport.ts`. See `../../start-preparing-how-to-virtual-scone.md`
(the planning doc) for the full design rationale.

**Message persistence**: every `chat:outgoing` is durably stored (`GET /messages/{id}` reads
it back) as ciphertext + nonce only — the server never has the key material to decrypt it,
only the two devices do. This is what lets every tab (and every device) hydrate the same
conversation instead of each tab keeping its own independent in-memory copy. Earlier versions
of this backend stored nothing at all; that was revisited once cross-tab/cross-device sync
needed a real source of truth to hydrate from, without weakening the "server can't read your
messages" guarantee — see `backend/tests/integration/test_message_persistence.py`.

One deliberate deviation from the original plan: **auth resolves the device from the
bearer token alone** (via a unique index on `devices.auth_token_hash`), both for REST
and for the WS auth frame. The plan's draft WS auth frame included `device_id`
alongside `auth_token`; that's dropped here since it added a class of bug (client
sending a token that doesn't match the given device_id) for no benefit — the token
already uniquely identifies the device.

## REST (`/api/v1`)

`Authorization: Bearer <auth_token>` required on all routes except `register` and `config`.

- `POST /devices/register` — body `{"public_key": "<base64, 32 bytes>"}` →
  `{"device_id": str, "auth_token": str}`. Call once per install.
- `POST /pairing/invite` — auth required → `{"code": str, "expires_at": ISO8601}`.
- `POST /pairing/accept` — auth required, body `{"code": str, "display_name": str}`
  (the name *you* are giving the inviter) → `{"device_id", "public_key", "display_name"}`
  for the inviter. 404 if the code doesn't exist or was already used; 410 if expired
  (the invite document itself is never deleted in either case).
- `GET /contacts` — auth required → `[{"device_id", "display_name", "public_key",
  "status": "online"|"offline", "connected": bool}]`. `connected` is false once the
  *other* side has disconnected you — your own row (and thus this list entry) is
  untouched, but chat delivery and presence to/from that peer are blocked (see
  `DELETE /contacts` and the WS section below).
- `PATCH /contacts/{device_id}` — auth required, body `{"display_name": str}` → `204`.
  Renames the caller's own copy of that contact (one-sided, like `DELETE` — the peer's row
  is untouched). 400 if the trimmed name is empty; 404 if the caller had no such contact.
- `DELETE /contacts/{device_id}` — auth required → `204`. Only the caller's own contact
  doc is soft-deleted (`deleted_at` set, row kept for the unique index) — the peer's row
  is untouched, so it stays in *their* `GET /contacts` list, just with `connected: false`.
  This is a real mutual block despite being a one-sided write: `chat:outgoing` and
  `presence:contact` both require *both* directions to still be active (see below), so
  the disconnected peer can no longer message or see live presence for the device that
  disconnected them, even though they never removed the contact themselves. If they're
  online when this happens, they also get a live `contact:disconnected` push (see WS
  section). 404 if the caller had no such contact. A later invite/accept between the
  same two devices revives both rows (clears `deleted_at` on each) instead of erroring.
- `GET /messages/{device_id}` — auth required → `[{"message_id", "direction":
  "outgoing"|"incoming", "ciphertext", "nonce", "created_at"}]`, chronological, capped at
  `MESSAGE_HISTORY_LIMIT` most recent (`constants.py`). Scoped to the caller by construction —
  every match has the caller's own device_id on one side, so this can only ever return a
  conversation the caller actually took part in. Survives either side disconnecting (reads
  `db.messages` only, never `db.contacts`).
- `GET /config` — no auth → `{"quick_replies": [str], "message_char_limit": int,
  "feature_flags": {str: bool}, "invite_code_ttl_minutes": int}`.

## WebSocket (`/ws`)

Connect, then send an auth frame as the first message:

```json
{"type": "auth", "auth_token": "<token>"}
```

If it doesn't arrive within 5s, is malformed, or the token is unknown, the server
closes the socket (codes `4001` timeout, `4004` malformed, `4003` invalid token — see
`constants.py`). No explicit "auth ok" frame is sent on success; the client should
treat "connection stays open" as success and start sending/receiving normally.

**Client → server**

| type | fields |
|---|---|
| `chat:outgoing` | `contactId, messageId, ciphertext, nonce` |
| `chat:delivered-ack` | `contactId, messageId` |
| `chat:read-ack` | `contactId, messageId, readAt` |
| `chat:typing` | `contactId, state: "idle"\|"typing"` |
| `ping` | — → replies `{"type": "pong"}` on the same socket |

`ping`/`pong` are transport-level, not chat frames — handled before the `InboundFrame`
union, no auth/contact checks beyond the connection already being authenticated. The
browser `WebSocket` API exposes no native ping/pong, so this exists for the client to
detect a half-dead connection itself (missed pong within a timeout ⇒ treat as closed and
reconnect) rather than waiting indefinitely on a socket that looks open but isn't.

`contactId` is always the *other device's* `device_id`. `chat:outgoing` is silently
dropped unless *both* the sender still has `contactId` as an active contact *and*
`contactId` still has the sender as one (no error frame either way — matches "don't leak
whether a device_id exists," and also means a disconnected peer gets no signal about
which case it was).

**Server → client**

| type | fields | meaning |
|---|---|---|
| `chat:ack` | `contactId, messageId` | recipient was online, message relayed live |
| `chat:pending` | `contactId, messageId` | recipient offline; the message *is* durably stored (see `GET /messages`) — this just tells the sender it wasn't relayed live, not that it was lost. The recipient picks it up next time they (or any of their tabs) fetch history. |
| `chat:incoming` | `contactId, message: {id, ciphertext, nonce}` | |
| `chat:delivered` | `contactId, messageId` | relayed from the recipient's `chat:delivered-ack` |
| `chat:read` | `contactId, messageId, readAt` | relayed from the recipient's `chat:read-ack` |
| `chat:remote-typing` | `contactId, state` | |
| `presence:contact` | `contactId, status: "online"\|"offline"` | sent to every device that has `contactId` as a contact *and* is still one of `contactId`'s active contacts (see `DELETE /contacts`), on that device's connect/disconnect |
| `contact:added` | `contactId, name, publicKey` | pushed to the inviter, live, if online when their invite is accepted |
| `contact:disconnected` | `contactId` | pushed to the peer, live, if online when `contactId` calls `DELETE /contacts` on them |

There is still no connect-time message flush over the WS itself and no `connection:status`
frame — history now comes from `GET /messages/{device_id}` (a client fetches it explicitly
whenever it needs to hydrate a conversation) rather than the server pushing a backlog on
connect. See the planning doc's "WebSocket protocol" section for the connection-status
rationale.
