import { DEMO_CONTACTS } from "../lib/demoContacts";
import type { ConnectionStatus, PresenceStatus } from "../lib/types";
import type { InboundFromBackground } from "../lib/transportProtocol";

/**
 * Stands in for a real WebSocket + server. Simulates connection lifecycle,
 * server ack / delivery ack / read-receipt timing, a short-lived pending
 * queue with TTL for offline recipients, and occasional demo traffic so the
 * UI is testable without a second real client.
 *
 * Swap this file for a real WebSocket client when a backend exists — the
 * message shapes in lib/transportProtocol.ts are the contract to keep.
 *
 * Caveat: an MV3 service worker can be terminated by the browser when idle,
 * which pauses these timers. A real backend (a persistent server process)
 * would not have this limitation.
 */

const TTL_MS = 45_000;
const DEMO_INCOMING_TEXTS = ["You there?", "haha nice", "brb 5 min", "sent!", "sounds good", "what time works?"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendToTab(tabId: number, message: InboundFromBackground): void {
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError; // no content script in that tab; ignore
  });
}

async function broadcastToAllTabs(message: InboundFromBackground): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined) sendToTab(tab.id, message);
  }
}

interface PendingEntry {
  contactId: string;
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
}

class MockTransport {
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
    await delay(500 + Math.random() * 400);
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
    }, 25_000 + Math.random() * 15_000);
  }

  private startDemoMessages(): void {
    this.demoMessageTimer = setInterval(async () => {
      const contact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
      if (this.presence.get(contact.id) !== "online") return;

      await broadcastToAllTabs({ type: "chat:remote-typing", contactId: contact.id, state: "typing" });
      await delay(1200 + Math.random() * 1500);
      await broadcastToAllTabs({ type: "chat:remote-typing", contactId: contact.id, state: "idle" });

      const text = DEMO_INCOMING_TEXTS[Math.floor(Math.random() * DEMO_INCOMING_TEXTS.length)];
      await broadcastToAllTabs({
        type: "chat:incoming",
        contactId: contact.id,
        message: { id: `demo_${Date.now()}`, text, timestamp: Date.now() },
      });
    }, 30_000 + Math.random() * 20_000);
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
    const readDelay = 2000 + Math.random() * 5000;
    setTimeout(() => {
      sendToTab(tabId, { type: "chat:read", contactId, messageId, readAt: Date.now() });
    }, readDelay);
  }

  /** Type "/fail" as a message to deterministically exercise the failed/retry UI. */
  async handleOutgoing(contactId: string, messageId: string, text: string, tabId: number): Promise<void> {
    if (this.status !== "connected") return;

    await delay(250 + Math.random() * 350);

    if (text.trim() === "/fail") {
      sendToTab(tabId, { type: "chat:failed", contactId, messageId });
      return;
    }

    sendToTab(tabId, { type: "chat:ack", contactId, messageId });

    const recipientOnline = this.presence.get(contactId) === "online";
    if (recipientOnline) {
      await delay(300 + Math.random() * 500);
      this.markDelivered(contactId, tabId, messageId);
      return;
    }

    const timer = setTimeout(() => {
      this.pending.delete(messageId);
      sendToTab(tabId, { type: "chat:failed", contactId, messageId });
    }, TTL_MS);
    this.pending.set(messageId, { contactId, tabId, timer });
  }
}

export const mockTransport = new MockTransport();
