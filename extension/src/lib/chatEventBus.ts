import { TypedEmitter } from "./emitter";
import type { OutboundToBackground } from "./transportProtocol";
import type { ChatBusEvents, ChatMessage, ChatState, Contact, MessageDeliveryState, TypingState } from "./types";

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `msg_${Date.now()}_${messageSeq}`;
}

const TYPING_INACTIVITY_MS = 3000;
const REMOTE_TYPING_FAILSAFE_MS = 8000;

function postToBackground(message: OutboundToBackground): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // background not reachable (e.g. right after install); safe to ignore
  });
}

/**
 * Holds one conversation in runtime memory only — no persistence.
 * Outbound sends go through `sendMessage`; everything the transport layer
 * reports back (ack / delivered / read / failed / incoming / typing /
 * presence) comes in through the `apply*` methods, called by ChatWorkspace
 * as it routes messages from the background service worker.
 */
export class ChatController extends TypedEmitter<ChatBusEvents> {
  private state: ChatState;
  private localTypingActive = false;
  private typingTimer: ReturnType<typeof setTimeout> | undefined;
  private remoteTypingFailsafe: ReturnType<typeof setTimeout> | undefined;

  constructor(contact: Contact, initialMessages: ChatMessage[] = []) {
    super();
    this.state = { contact, messages: initialMessages, unreadCount: 0, draft: "", remoteTyping: "idle" };
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
    };
    this.setState({ messages: [...this.state.messages, message], draft: "" });
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

  receiveMessage(text: string, id: string, opts: { markUnread: boolean }): void {
    const message: ChatMessage = {
      id,
      text,
      direction: "incoming",
      timestamp: Date.now(),
      deliveryState: "delivered",
    };
    this.setState({
      messages: [...this.state.messages, message],
      unreadCount: opts.markUnread ? this.state.unreadCount + 1 : this.state.unreadCount,
    });
    this.emit("message:incoming", message);
  }

  applyRemoteTyping(state: TypingState): void {
    if (this.remoteTypingFailsafe) clearTimeout(this.remoteTypingFailsafe);
    this.setState({ remoteTyping: state });
    if (state === "typing") {
      this.remoteTypingFailsafe = setTimeout(() => this.setState({ remoteTyping: "idle" }), REMOTE_TYPING_FAILSAFE_MS);
    }
  }

  clearUnread(): void {
    if (this.state.unreadCount === 0) return;
    this.setState({ unreadCount: 0 });
  }

  setPresence(status: Contact["status"]): void {
    this.setState({ contact: { ...this.state.contact, status } });
    this.emit("presence:changed", status);
  }
}
