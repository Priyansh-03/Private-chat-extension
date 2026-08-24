import { ChatController } from "./chatEventBus";
import { TypedEmitter } from "./emitter";
import type { InboundFromBackground } from "./transportProtocol";
import type { ChatMessage, Contact } from "./types";

export interface ContactSeed {
  contact: Contact;
  messages?: ChatMessage[];
}

type WorkspaceEvents = { "active:changed": string };

/**
 * Owns every conversation for the tab and routes inbound background-service-
 * worker events to the right ChatController by contactId. There is exactly
 * one workspace per content-script instance (per tab).
 */
export class ChatWorkspace extends TypedEmitter<WorkspaceEvents> {
  private controllers = new Map<string, ChatController>();
  private order: string[] = [];
  private activeId: string;

  constructor(seeds: ContactSeed[]) {
    super();
    for (const seed of seeds) {
      this.controllers.set(seed.contact.id, new ChatController(seed.contact, seed.messages ?? []));
      this.order.push(seed.contact.id);
    }
    this.activeId = this.order[0];
  }

  getContactIds(): string[] {
    return this.order;
  }

  getController(id: string): ChatController | undefined {
    return this.controllers.get(id);
  }

  getActiveController(): ChatController {
    return this.controllers.get(this.activeId)!;
  }

  getActiveId(): string {
    return this.activeId;
  }

  setActive(id: string): void {
    if (!this.controllers.has(id) || id === this.activeId) return;
    this.activeId = id;
    this.emit("active:changed", id);
  }

  getTotalUnread(): number {
    let total = 0;
    for (const controller of this.controllers.values()) total += controller.getState().unreadCount;
    return total;
  }

  /** Subscribes to every controller plus active-contact changes; returns one combined unsubscribe. */
  onAnyChange(callback: () => void): () => void {
    const unsubscribes = this.order.map((id) => this.controllers.get(id)!.on("state:changed", callback));
    const unsubscribeActive = this.on("active:changed", callback);
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribeActive();
    };
  }

  /** Fires whenever any conversation receives a new incoming message — used to drive the FAB pulse/sound. */
  onIncoming(callback: (contactId: string) => void): () => void {
    const unsubscribes = this.order.map((id) =>
      this.controllers.get(id)!.on("message:incoming", () => callback(id)),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  /**
   * Active contact changes only through explicit user action (setActive /
   * handleSelectContact) — never automatically because a message arrived.
   * "Left-click opens whoever I was last talking to" means last talking to,
   * not last to message me.
   */
  route(event: InboundFromBackground): void {
    switch (event.type) {
      case "chat:ack":
        this.controllers.get(event.contactId)?.applyAck(event.messageId);
        break;
      case "chat:delivered":
        this.controllers.get(event.contactId)?.applyDelivered(event.messageId);
        break;
      case "chat:read":
        this.controllers.get(event.contactId)?.applyRead(event.messageId, event.readAt);
        break;
      case "chat:failed":
        this.controllers.get(event.contactId)?.applyFailed(event.messageId);
        break;
      case "chat:incoming": {
        const controller = this.controllers.get(event.contactId);
        if (!controller) break;
        controller.receiveMessage(event.message.text, event.message.id, { markUnread: true });
        break;
      }
      case "chat:remote-typing":
        this.controllers.get(event.contactId)?.applyRemoteTyping(event.state);
        break;
      case "presence:contact":
        this.controllers.get(event.contactId)?.setPresence(event.status);
        break;
      default:
        break;
    }
  }
}
