import { BACKEND_WS_URL } from "../lib/backendConfig";
import {
  acceptInvite as acceptInviteRequest,
  BackendApiError,
  createInvite as createInviteRequest,
  deleteContact as deleteContactRequest,
  listContacts,
  registerDevice,
} from "../lib/backendClient";
import { WS_RECONNECT_BASE_DELAY_MS, WS_RECONNECT_JITTER_MS, WS_RECONNECT_MAX_DELAY_MS } from "../lib/constants";
import { decryptMessage, encryptMessage, loadOrCreateKeyPair } from "../lib/crypto";
import { loadDeviceIdentity, saveDeviceIdentity, type DeviceIdentity } from "../lib/deviceIdentity";
import type {
  AcceptInviteResponse,
  CreateInviteResponse,
  PendingIncomingEntry,
  RemoteContactSnapshot,
  RemoveContactResponse,
} from "../lib/transportProtocol";
import type { ConnectionStatus, PresenceStatus, TypingState } from "../lib/types";
import * as inbox from "./incomingInbox";
import { notifyNewMessage } from "./notifications";
import * as retryQueue from "./pendingRetryQueue";
import { broadcastToAllTabs } from "./tabMessaging";
import type { ChatTransport } from "./chatTransport";

interface ContactCacheEntry {
  publicKey: string;
  name: string;
  status: PresenceStatus;
  connected: boolean;
}

/** Server → client wire frames, per backend/docs/protocol.md. Kept separate from
 * InboundFromBackground: the wire format carries ciphertext, the local one carries plaintext —
 * this class is exactly the seam that translates between them. */
type WireFrame =
  | { type: "chat:ack"; contactId: string; messageId: string }
  | { type: "chat:pending"; contactId: string; messageId: string }
  | { type: "chat:incoming"; contactId: string; message: { id: string; ciphertext: string; nonce: string } }
  | { type: "chat:delivered"; contactId: string; messageId: string }
  | { type: "chat:read"; contactId: string; messageId: string; readAt: number }
  | { type: "chat:remote-typing"; contactId: string; state: TypingState }
  | { type: "presence:contact"; contactId: string; status: PresenceStatus }
  | { type: "contact:added"; contactId: string; name: string; publicKey: string }
  | { type: "contact:disconnected"; contactId: string };

class BackendTransport implements ChatTransport {
  private status: ConnectionStatus = "off";
  private ws: WebSocket | null = null;
  private stopped = true;
  private identity: DeviceIdentity | null = null;
  private secretKey: string | null = null;
  private contacts = new Map<string, ContactCacheEntry>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guards concurrent callers (e.g. opening a chat panel and creating an invite at the same
   * moment) from each independently registering a *different* device — see ensureIdentity(). */
  private identityPromise: Promise<void> | null = null;
  /** messageIds with an outstanding chat:outgoing send that hasn't gotten a chat:ack/chat:pending
   * response yet — flushPending/flushPendingForContact skip these so a reconnect racing a
   * presence:online event for the same contact can't fire the same send twice. */
  private inFlight = new Set<string>();

  getStatus(): ConnectionStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.ensureIdentity();
    await this.refreshContacts();
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.inFlight.clear();
    this.setStatus("off");
  }

  // Every method below is called from background/index.ts as `.then(sendResponse)` with no
  // `.catch` — chrome.runtime's response port has no timeout of its own, so a rejected promise
  // here means the caller (the popup) hangs forever waiting for a response that never comes.
  // ensureIdentity() throwing (e.g. backend unreachable on a first-ever registration) is a real,
  // not-hypothetical way to hit that, so nothing here is allowed to let an exception escape.

  async createInvite(): Promise<CreateInviteResponse> {
    try {
      await this.ensureIdentity();
      if (!this.identity) return { ok: false, error: "Couldn't set up your device identity. Try again." };
      const invite = await createInviteRequest(this.identity.authToken);
      return { ok: true, code: invite.code, expiresAt: invite.expires_at };
    } catch (error) {
      return { ok: false, error: friendlyPairingError(error) };
    }
  }

  async acceptInvite(code: string, displayName: string): Promise<AcceptInviteResponse> {
    try {
      await this.ensureIdentity();
      if (!this.identity) return { ok: false, error: "Couldn't set up your device identity. Try again." };
      const result = await acceptInviteRequest(this.identity.authToken, code, displayName);
      await this.refreshContacts();
      // The inviter gets a live contact:added push over WS when their invite is accepted (see
      // handleFrame's "contact:added" case) — but as the *acceptor*, nothing else tells any open
      // tab's ChatWorkspace this contact now exists; it only reaches the popup that made this
      // call. Broadcast it the same way so both sides' chat UI actually shows the new contact.
      await broadcastToAllTabs({
        type: "contact:added",
        contactId: result.device_id,
        name: result.display_name,
        publicKey: result.public_key,
      });
      return { ok: true, contactId: result.device_id, name: result.display_name };
    } catch (error) {
      return { ok: false, error: friendlyPairingError(error) };
    }
  }

  async removeContact(contactId: string): Promise<RemoveContactResponse> {
    try {
      await this.ensureIdentity();
      if (!this.identity) return { ok: false, error: "Couldn't set up your device identity. Try again." };
      await deleteContactRequest(this.identity.authToken, contactId);
      this.contacts.delete(contactId);
      await broadcastToAllTabs({ type: "contact:removed", contactId });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: friendlyContactError(error) };
    }
  }

  async drainPendingIncoming(): Promise<PendingIncomingEntry[]> {
    return inbox.drainAll();
  }

  async getContactsSnapshot(): Promise<RemoteContactSnapshot[]> {
    try {
      await this.refreshContacts();
    } catch {
      // Fall through and return whatever's cached (possibly stale, possibly empty) rather than
      // hanging the caller — a transient fetch failure shouldn't block reading the last-known list.
    }
    return [...this.contacts.entries()].map(([contactId, entry]) => ({
      contactId,
      name: entry.name,
      publicKey: entry.publicKey,
      status: entry.status,
      connected: entry.connected,
    }));
  }

  handleOutgoing(contactId: string, messageId: string, text: string, _tabId: number): void {
    void this.sendEncrypted(contactId, messageId, text);
  }

  handleTyping(contactId: string, state: TypingState): void {
    this.send({ type: "chat:typing", contactId, state });
  }

  handleReadAck(contactId: string, messageId: string, readAt: number): void {
    this.send({ type: "chat:read-ack", contactId, messageId, readAt });
  }

  // ---------- identity + contacts ----------

  private async ensureIdentity(): Promise<void> {
    if (this.identity && this.secretKey) return;
    // Concurrent callers (start(), sendEncrypted(), createInvite(), ...) all await the same
    // in-flight attempt instead of racing separate keypair-generate-and-register calls — two
    // callers seeing "nothing stored yet" at once would otherwise register two different devices
    // and silently discard one keypair, permanently desyncing it from whichever registration won.
    if (!this.identityPromise) {
      this.identityPromise = this.doEnsureIdentity().finally(() => {
        this.identityPromise = null;
      });
    }
    await this.identityPromise;
  }

  private async doEnsureIdentity(): Promise<void> {
    const keyPair = await loadOrCreateKeyPair();
    this.secretKey = keyPair.secretKey;

    const stored = await loadDeviceIdentity();
    if (stored) {
      this.identity = stored;
      return;
    }
    const registered = await registerDevice(keyPair.publicKey);
    this.identity = { deviceId: registered.device_id, authToken: registered.auth_token };
    await saveDeviceIdentity(this.identity);
  }

  /** Upserts rather than replacing the map wholesale: a slightly-stale REST response landing
   * after a live contact:added WS event (both can be in flight at once — e.g. the popup asking
   * for the list right as someone accepts your invite) would otherwise silently wipe out the
   * contact the WS event just added. Removal goes through removeContact() instead, which deletes
   * from this map directly — refreshContacts() merging a list that just excludes a removed
   * contact wouldn't undo that, since it only ever adds/updates entries, never deletes. */
  private async refreshContacts(): Promise<void> {
    if (!this.identity) return;
    const remote = await listContacts(this.identity.authToken);
    for (const contact of remote) {
      this.contacts.set(contact.device_id, {
        publicKey: contact.public_key,
        name: contact.display_name,
        status: contact.status,
        connected: contact.connected,
      });
    }
  }

  // ---------- connection lifecycle ----------

  private connect(): void {
    if (this.stopped || !this.identity) return;
    this.setStatus(this.reconnectAttempt === 0 ? "connecting" : "problem");

    const ws = new WebSocket(BACKEND_WS_URL);
    this.ws = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "auth", auth_token: this.identity?.authToken }));
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      void this.flushPending();
    });

    ws.addEventListener("message", (event) => {
      void this.handleFrame(JSON.parse(event.data as string) as WireFrame);
    });

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return; // superseded by a newer connection attempt
      this.ws = null;
      // Nothing is actually in flight once the connection that would carry an ack is gone —
      // otherwise a message sent right before a drop would never be eligible for resend after
      // reconnecting, since flushPending() would keep skipping it as "already in flight" forever.
      this.inFlight.clear();
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    this.setStatus("problem");
    const backoff = WS_RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt;
    const delay = Math.min(backoff, WS_RECONNECT_MAX_DELAY_MS) + Math.random() * WS_RECONNECT_JITTER_MS;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    void broadcastToAllTabs({ type: "connection:status", status });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  // ---------- outgoing ----------

  private async sendEncrypted(contactId: string, messageId: string, text: string): Promise<void> {
    await this.ensureIdentity();
    const contact = this.contacts.get(contactId);
    if (!contact || !this.secretKey) return; // unknown contact; nothing we can encrypt to
    const { ciphertext, nonce } = encryptMessage(text, contact.publicKey, this.secretKey);

    // Always queue first, regardless of connection state: this is the one durable record of "not
    // yet confirmed delivered live," dequeued only on chat:ack. Without this, a chat:pending
    // response (recipient offline right now) had nothing to retry against once they came back —
    // the message would just sit "sent" forever and never actually redeliver.
    await retryQueue.enqueue({ contactId, messageId, ciphertext, nonce });
    this.sendQueuedFrame({ contactId, messageId, ciphertext, nonce });
  }

  private sendQueuedFrame(entry: retryQueue.PendingSend): void {
    if (this.status !== "connected" || this.inFlight.has(entry.messageId)) return;
    this.inFlight.add(entry.messageId);
    this.send({ type: "chat:outgoing", ...entry });
  }

  private async flushPending(): Promise<void> {
    for (const entry of await retryQueue.all()) this.sendQueuedFrame(entry);
  }

  private async flushPendingForContact(contactId: string): Promise<void> {
    for (const entry of await retryQueue.forContact(contactId)) this.sendQueuedFrame(entry);
  }

  // ---------- incoming ----------

  private async handleFrame(frame: WireFrame): Promise<void> {
    switch (frame.type) {
      case "chat:ack": {
        this.inFlight.delete(frame.messageId);
        await retryQueue.dequeue(frame.messageId);
        await broadcastToAllTabs({ type: "chat:ack", contactId: frame.contactId, messageId: frame.messageId });
        return;
      }
      case "chat:pending": {
        // Nothing was queued server-side; the message stays in our own retry queue (already
        // enqueued by sendEncrypted before this send went out) until presence:contact reports the
        // recipient online again. Shown as "sent" either way, matching chatEventBus.ts's
        // applyAck — no separate local frame needed beyond that same chat:ack.
        this.inFlight.delete(frame.messageId);
        await broadcastToAllTabs({ type: "chat:ack", contactId: frame.contactId, messageId: frame.messageId });
        return;
      }
      case "chat:incoming": {
        await this.ensureIdentity();
        let contact = this.contacts.get(frame.contactId);
        if (!contact) {
          // Not necessarily wrong — the local cache could just be stale relative to a pairing
          // that happened moments ago — but it's exactly the kind of thing that otherwise fails
          // silently with zero trace, so give it one retry against the server before giving up.
          await this.refreshContacts();
          contact = this.contacts.get(frame.contactId);
          if (!contact) console.warn(`[private-chat] chat:incoming from unknown contact ${frame.contactId} — dropped`);
        }
        const plaintext =
          contact && this.secretKey
            ? decryptMessage(frame.message.ciphertext, frame.message.nonce, contact.publicKey, this.secretKey)
            : null;
        if (contact && plaintext === null) {
          console.warn(`[private-chat] chat:incoming from ${frame.contactId} failed to decrypt — dropped`);
        }
        if (plaintext === null) return; // unknown sender or failed to authenticate; drop
        this.send({ type: "chat:delivered-ack", contactId: frame.contactId, messageId: frame.message.id });

        const message = { id: frame.message.id, text: plaintext, timestamp: Date.now() };
        // Persist before broadcasting: if no tab is open (or listening) to receive the live
        // broadcast below, this is the only record of the message left anywhere — the server
        // never stores it, and chat:delivered-ack above already told the sender it arrived.
        // Without this it was just silently gone, despite the receiver's OS notification firing.
        await inbox.enqueue({ contactId: frame.contactId, message });
        const deliveredLive = await broadcastToAllTabs({ type: "chat:incoming", contactId: frame.contactId, message });
        if (deliveredLive) await inbox.dequeue(message.id);
        void notifyNewMessage();
        return;
      }
      case "chat:delivered":
        await broadcastToAllTabs({ type: "chat:delivered", contactId: frame.contactId, messageId: frame.messageId });
        return;
      case "chat:read":
        await broadcastToAllTabs({ type: "chat:read", contactId: frame.contactId, messageId: frame.messageId, readAt: frame.readAt });
        return;
      case "chat:remote-typing":
        await broadcastToAllTabs({ type: "chat:remote-typing", contactId: frame.contactId, state: frame.state });
        return;
      case "presence:contact": {
        const contact = this.contacts.get(frame.contactId);
        if (contact) contact.status = frame.status;
        await broadcastToAllTabs({ type: "presence:contact", contactId: frame.contactId, status: frame.status });
        if (frame.status === "online") void this.flushPendingForContact(frame.contactId);
        return;
      }
      case "contact:added": {
        this.contacts.set(frame.contactId, { publicKey: frame.publicKey, name: frame.name, status: "offline", connected: true });
        await broadcastToAllTabs({ type: "contact:added", contactId: frame.contactId, name: frame.name, publicKey: frame.publicKey });
        return;
      }
      case "contact:disconnected": {
        const contact = this.contacts.get(frame.contactId);
        if (contact) contact.connected = false;
        await broadcastToAllTabs({ type: "contact:disconnected", contactId: frame.contactId });
        return;
      }
    }
  }
}

/** Maps backend errors to copy a non-technical user can act on — never the raw method/path/status
 * (see BackendApiError's doc comment). Status codes are the ones pairing/invite and pairing/accept
 * actually raise; anything else (network failure, unexpected 5xx, ...) falls through to a generic
 * "couldn't reach the server" message rather than leaking implementation detail. */
function friendlyPairingError(error: unknown): string {
  if (error instanceof BackendApiError) {
    switch (error.status) {
      case 404:
        return "That invite code doesn't exist or has already been used.";
      case 410:
        return "That invite code has expired — ask them to create a new one.";
      case 400:
        return "You can't pair with your own invite code.";
      case 401:
        return "Your device isn't recognized by the server. Try again.";
    }
  }
  return "Couldn't reach the server — check your connection and try again.";
}

/** Same fallback as friendlyPairingError, but for DELETE /contacts — different 404/401 copy. */
function friendlyContactError(error: unknown): string {
  if (error instanceof BackendApiError) {
    switch (error.status) {
      case 404:
        return "That contact is already gone.";
      case 401:
        return "Your device isn't recognized by the server. Try again.";
    }
  }
  return "Couldn't reach the server — check your connection and try again.";
}

export const backendTransport = new BackendTransport();
