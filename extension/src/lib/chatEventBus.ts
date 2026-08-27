import { REMOTE_TYPING_FAILSAFE_MS, TYPING_INACTIVITY_MS } from "./constants";
import { TypedEmitter } from "./emitter";
import type { OutboundToBackground } from "./transportProtocol";
import type { ChatBusEvents, ChatMessage, ChatState, Contact, MessageDeliveryState, TypingState } from "./types";

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `msg_${Date.now()}_${messageSeq}`;
}

function postToBackground(message: OutboundToBackground): void {
  // background not reachable right after install; safe to ignore
  chrome.runtime.sendMessage(message).catch(() => {});
}

function computeUnreadCount(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => n + (m.direction === "incoming" && !m.seen ? 1 : 0), 0);
}

export function getUnseenIncoming(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.direction === "incoming" && !m.seen);
}

/** Inserts in timestamp order rather than trusting call order to already match chronology — a
 * live chat:incoming and a just-hydrated history batch (or a message replayed from
 * workspace.ts's pendingEvents buffer) can otherwise land in whatever order their async work
 * happened to resolve in. Array.prototype.sort is stable, so an exact-same-millisecond tie falls
 * back to insertion order rather than jittering on every re-render. */
function insertMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return [...messages, message].sort((a, b) => a.timestamp - b.timestamp);
}

/** One conversation, in-memory only. Outbound via sendMessage; inbound via the apply-prefixed methods and markSeen, called by ChatWorkspace. */
export class ChatController extends TypedEmitter<ChatBusEvents> {
  private state: ChatState;
  private localTypingActive = false;
  private typingTimer: ReturnType<typeof setTimeout> | undefined;
  private remoteTypingFailsafe: ReturnType<typeof setTimeout> | undefined;

  constructor(contact: Contact, initialMessages: ChatMessage[] = []) {
    super();
    this.state = {
      contact,
      messages: initialMessages,
      unreadCount: computeUnreadCount(initialMessages),
      draft: "",
      remoteTyping: "idle",
    };
  }

  getState(): ChatState {
    return this.state;
  }

  private setState(patch: Partial<ChatState>): void {
    this.state = { ...this.state, ...patch };
    this.emit("state:changed", this.state);
  }

  private updateMessage(messageId: string, patch: Partial<ChatMessage>): void {
    const index = this.state.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    const messages = this.state.messages.slice();
    messages[index] = { ...messages[index], ...patch };
    this.setState({ messages });
  }

  // ---------- outgoing ----------

  sendMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const message: ChatMessage = {
      id: nextId(),
      text: trimmed,
      direction: "outgoing",
      timestamp: Date.now(),
      deliveryState: "sending",
      seen: true,
    };
    const messages = insertMessage(this.state.messages, message);
    this.setState({ messages, draft: "" });
    this.stopTyping();
    this.emit("message:outgoing", message);
    postToBackground({ type: "chat:outgoing", contactId: this.state.contact.id, messageId: message.id, text: trimmed });
  }

  retryMessage(messageId: string): void {
    const message = this.state.messages.find((m) => m.id === messageId);
    if (!message || message.deliveryState !== "failed") return;
    this.updateMessage(messageId, { deliveryState: "sending" });
    postToBackground({ type: "chat:outgoing", contactId: this.state.contact.id, messageId, text: message.text });
  }

  // ---------- draft + typing ----------

  setDraft(text: string): void {
    this.setState({ draft: text });
    if (text.trim().length === 0) {
      this.stopTyping();
      return;
    }
    if (!this.localTypingActive) {
      this.localTypingActive = true;
      this.postTyping("typing");
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), TYPING_INACTIVITY_MS);
  }

  private stopTyping(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = undefined;
    if (this.localTypingActive) {
      this.localTypingActive = false;
      this.postTyping("idle");
    }
  }

  private postTyping(state: TypingState): void {
    postToBackground({ type: "chat:typing", contactId: this.state.contact.id, state });
  }

  // ---------- inbound, routed by ChatWorkspace ----------

  applyAck(messageId: string): void {
    const message = this.state.messages.find((m) => m.id === messageId);
    if (message?.deliveryState === "sending") this.updateMessage(messageId, { deliveryState: "server_accepted" });
  }

  applyDelivered(messageId: string): void {
    const message = this.state.messages.find((m) => m.id === messageId);
    if (message && message.deliveryState !== "read") {
      this.updateMessage(messageId, { deliveryState: "delivered" as MessageDeliveryState });
    }
  }

  applyRead(messageId: string, readAt: number): void {
    this.updateMessage(messageId, { deliveryState: "read", readAt });
  }

  applyFailed(messageId: string): void {
    this.updateMessage(messageId, { deliveryState: "failed" });
  }

  /** messageId is not deduped server-side (see backend/docs/protocol.md) — a resend after a
   * dropped ack, or a retry racing a live delivery, can legitimately reach here twice for the
   * same id. Silently drop the repeat rather than rendering a duplicate bubble.
   *
   * timestamp comes from the caller (the server's own created_at for a live message, or
   * whatever a history hydration supplied) rather than Date.now() here — this tab's local
   * processing time is not when the message actually happened. */
  receiveMessage(text: string, id: string, timestamp: number): void {
    if (this.state.messages.some((m) => m.id === id)) return;
    const message: ChatMessage = {
      id,
      text,
      direction: "incoming",
      timestamp,
      deliveryState: "delivered",
      seen: false,
    };
    const messages = insertMessage(this.state.messages, message);
    this.setState({ messages, unreadCount: computeUnreadCount(messages) });
    this.emit("message:incoming", message);
  }

  renameContact(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || trimmed === this.state.contact.name) return;
    this.setState({ contact: { ...this.state.contact, name: trimmed } });
  }

  /** One-way: a message can only go unseen -> seen, never back. No-op if already seen or outgoing.
   * Also the signal the real backend needs to relay a read receipt back to the sender — the mock
   * transport just ignores this outbound type, matching its "no real peer" chat:typing handling. */
  markSeen(messageId: string): void {
    const message = this.state.messages.find((m) => m.id === messageId);
    if (!message || message.direction !== "incoming" || message.seen) return;
    const messages = this.state.messages.map((m) => (m.id === messageId ? { ...m, seen: true } : m));
    this.setState({ messages, unreadCount: computeUnreadCount(messages) });
    postToBackground({ type: "chat:read-ack", contactId: this.state.contact.id, messageId, readAt: Date.now() });
  }

  applyRemoteTyping(state: TypingState): void {
    if (this.remoteTypingFailsafe) clearTimeout(this.remoteTypingFailsafe);
    this.setState({ remoteTyping: state });
    if (state === "typing") {
      this.remoteTypingFailsafe = setTimeout(() => this.setState({ remoteTyping: "idle" }), REMOTE_TYPING_FAILSAFE_MS);
    }
  }

  setPresence(status: Contact["status"]): void {
    this.setState({ contact: { ...this.state.contact, status } });
    this.emit("presence:changed", status);
  }

  /** One-way, like markSeen: connected can only go true -> false locally (the disconnecting side
   * doesn't reconnect this contact — a fresh accepted invite constructs a new one instead, see
   * workspace.addContact's idempotency guard). */
  setConnected(connected: boolean): void {
    if (this.state.contact.connected === connected) return;
    this.setState({ contact: { ...this.state.contact, connected } });
    this.emit("connected:changed", connected);
  }
}
