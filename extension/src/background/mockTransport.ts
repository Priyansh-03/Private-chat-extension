import {
  MOCK_ACK_DELAY_JITTER_MS,
  MOCK_ACK_DELAY_MS,
  MOCK_CONNECT_DELAY_JITTER_MS,
  MOCK_CONNECT_DELAY_MS,
  MOCK_DELIVERY_DELAY_JITTER_MS,
  MOCK_DELIVERY_DELAY_MS,
  MOCK_DEMO_MESSAGE_INTERVAL_MS,
  MOCK_DEMO_MESSAGE_JITTER_MS,
  MOCK_OFFLINE_TTL_MS,
  MOCK_PRESENCE_FLIP_INTERVAL_MS,
  MOCK_PRESENCE_FLIP_JITTER_MS,
  MOCK_READ_DELAY_JITTER_MS,
  MOCK_READ_DELAY_MS,
  MOCK_TYPING_DURATION_JITTER_MS,
  MOCK_TYPING_DURATION_MS,
} from "../lib/constants";
import { DEMO_CONTACTS } from "../lib/demoContacts";
import type { PendingIncomingEntry, RemoveContactResponse, RenameContactResponse } from "../lib/transportProtocol";
import type { ConnectionStatus, PresenceStatus, TypingState } from "../lib/types";
import { notifyNewMessage } from "./notifications";
import { broadcastToAllTabs, sendToTab } from "./tabMessaging";
import type { ChatTransport } from "./chatTransport";

/** Stands in for a real WebSocket + server (ack/delivery/read timing, offline TTL queue, demo traffic) — swap for a real client, keep transportProtocol.ts's shapes. MV3 can idle-kill this worker, pausing these timers; a real server wouldn't have that limit. */

const DEMO_INCOMING_TEXTS = ["You there?", "haha nice", "brb 5 min", "sent!", "sounds good", "what time works?"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PendingEntry {
  contactId: string;
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
}

class MockTransport implements ChatTransport {
  private status: ConnectionStatus = "off";
  private presence = new Map<string, PresenceStatus>();
  private pending = new Map<string, PendingEntry>();
  private presenceFlipTimer: ReturnType<typeof setInterval> | null = null;
  private demoMessageTimer: ReturnType<typeof setInterval> | null = null;

  getStatus(): ConnectionStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.status === "connecting" || this.status === "connected") return;
    this.setStatus("connecting");
    for (const contact of DEMO_CONTACTS) this.presence.set(contact.id, "online");
    await delay(MOCK_CONNECT_DELAY_MS + Math.random() * MOCK_CONNECT_DELAY_JITTER_MS);
    this.setStatus("connected");
    this.startPresenceFlips();
    this.startDemoMessages();
  }

  stop(): void {
    this.setStatus("off");
    if (this.presenceFlipTimer) clearInterval(this.presenceFlipTimer);
    if (this.demoMessageTimer) clearInterval(this.demoMessageTimer);
    this.presenceFlipTimer = null;
    this.demoMessageTimer = null;
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    void broadcastToAllTabs({ type: "connection:status", status });
  }

  private startPresenceFlips(): void {
    this.presenceFlipTimer = setInterval(() => {
      const contact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
      const current = this.presence.get(contact.id) ?? "online";
      const next: PresenceStatus = current === "online" ? "offline" : "online";
      this.presence.set(contact.id, next);
      void broadcastToAllTabs({ type: "presence:contact", contactId: contact.id, status: next });
      if (next === "online") this.flushPending(contact.id);
    }, MOCK_PRESENCE_FLIP_INTERVAL_MS + Math.random() * MOCK_PRESENCE_FLIP_JITTER_MS);
  }

  private startDemoMessages(): void {
    this.demoMessageTimer = setInterval(async () => {
      const contact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
      if (this.presence.get(contact.id) !== "online") return;

      await broadcastToAllTabs({ type: "chat:remote-typing", contactId: contact.id, state: "typing" });
      await delay(MOCK_TYPING_DURATION_MS + Math.random() * MOCK_TYPING_DURATION_JITTER_MS);
      await broadcastToAllTabs({ type: "chat:remote-typing", contactId: contact.id, state: "idle" });

      const text = DEMO_INCOMING_TEXTS[Math.floor(Math.random() * DEMO_INCOMING_TEXTS.length)];
      await broadcastToAllTabs({
        type: "chat:incoming",
        contactId: contact.id,
        message: { id: `demo_${Date.now()}`, text, timestamp: Date.now() },
      });
      void notifyNewMessage();
    }, MOCK_DEMO_MESSAGE_INTERVAL_MS + Math.random() * MOCK_DEMO_MESSAGE_JITTER_MS);
  }

  private flushPending(contactId: string): void {
    for (const [messageId, entry] of this.pending) {
      if (entry.contactId !== contactId) continue;
      clearTimeout(entry.timer);
      this.pending.delete(messageId);
      this.markDelivered(entry.contactId, entry.tabId, messageId);
    }
  }

  private markDelivered(contactId: string, tabId: number, messageId: string): void {
    sendToTab(tabId, { type: "chat:delivered", contactId, messageId });
    const readDelay = MOCK_READ_DELAY_MS + Math.random() * MOCK_READ_DELAY_JITTER_MS;
    setTimeout(() => {
      sendToTab(tabId, { type: "chat:read", contactId, messageId, readAt: Date.now() });
    }, readDelay);
  }

  /** Type "/fail" as a message to deterministically exercise the failed/retry UI. */
  async handleOutgoing(contactId: string, messageId: string, text: string, tabId: number): Promise<void> {
    if (this.status !== "connected") return;

    await delay(MOCK_ACK_DELAY_MS + Math.random() * MOCK_ACK_DELAY_JITTER_MS);

    if (text.trim() === "/fail") {
      sendToTab(tabId, { type: "chat:failed", contactId, messageId });
      return;
    }

    sendToTab(tabId, { type: "chat:ack", contactId, messageId });

    const recipientOnline = this.presence.get(contactId) === "online";
    if (recipientOnline) {
      await delay(MOCK_DELIVERY_DELAY_MS + Math.random() * MOCK_DELIVERY_DELAY_JITTER_MS);
      this.markDelivered(contactId, tabId, messageId);
      return;
    }

    const timer = setTimeout(() => {
      this.pending.delete(messageId);
      sendToTab(tabId, { type: "chat:failed", contactId, messageId });
    }, MOCK_OFFLINE_TTL_MS);
    this.pending.set(messageId, { contactId, tabId, timer });
  }

  // No real peer in the mock transport to relay these to — a real backend forwards them over the
  // socket to the other participant (see backendTransport.ts).
  handleTyping(_contactId: string, _state: TypingState): void {}
  handleReadAck(_contactId: string, _messageId: string, _readAt: number): void {}

  // Demo contacts are a fixed in-memory list, not backed by any server call — removal is just a
  // local broadcast so the UI can exercise the same flow as the real backend.
  async removeContact(contactId: string): Promise<RemoveContactResponse> {
    this.presence.delete(contactId);
    await broadcastToAllTabs({ type: "contact:removed", contactId });
    return { ok: true };
  }

  async renameContact(contactId: string, name: string): Promise<RenameContactResponse> {
    await broadcastToAllTabs({ type: "contact:renamed", contactId, name });
    return { ok: true };
  }

  // Nothing to drain: sendToTab/broadcastToAllTabs here are purely in-memory demo traffic with no
  // durable backlog behind them, unlike backendTransport's incoming-inbox.
  async drainPendingIncoming(): Promise<PendingIncomingEntry[]> {
    return [];
  }
}

export const mockTransport = new MockTransport();
