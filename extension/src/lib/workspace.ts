import { ChatController } from "./chatEventBus";
import { TypedEmitter } from "./emitter";
import type { InboundFromBackground } from "./transportProtocol";
import { defaultContactName, type ChatMessage, type Contact } from "./types";

export interface ContactSeed {
  contact: Contact;
  messages?: ChatMessage[];
}

type WorkspaceEvents = {
  "active:changed": string;
  "contact:added": string;
  "contact:added:live": string;
  "contact:removed": string;
};

/** Contact ids that don't get their own controller — no data to route to. */
function eventContactId(event: InboundFromBackground): string | undefined {
  return event.type === "connection:status" ? undefined : event.contactId;
}

const MAX_PENDING_EVENTS_PER_CONTACT = 20;

/** Owns every conversation for the tab; routes inbound background events to the right ChatController by contactId. */
export class ChatWorkspace extends TypedEmitter<WorkspaceEvents> {
  private controllers = new Map<string, ChatController>();
  private order: string[] = [];
  private activeId: string | undefined;
  /** Events for a contact this tab doesn't know about *yet* — a real, not-hypothetical race: this
   * tab's contacts:request-list fetch is async, so a chat:incoming (or any other event) for an
   * already-paired contact can arrive before that fetch resolves, e.g. right after a page
   * load/navigation. Previously just silently dropped; now held here and replayed once addContact
   * brings the contact in. Capped per contact so a peer that never actually gets paired can't grow
   * this unboundedly. */
  private pendingEvents = new Map<string, InboundFromBackground[]>();

  constructor(seeds: ContactSeed[]) {
    super();
    for (const seed of seeds) this.addContact(seed, { silent: true });
  }

  /** Adds a contact after construction — real contacts arrive asynchronously (an initial fetch,
   * then live contact:added events), unlike the old fixed demo-seed list. A no-op if the contact
   * is already known (the initial fetch and a contact:added event can race and both resolve).
   *
   * `silent` distinguishes "this tab is just learning about a contact that already existed"
   * (construction seeds, the initial contacts:request-list fetch) from "a pairing genuinely just
   * happened" (a live contact:added WS/broadcast event via route()) — only the latter should
   * trigger the FAB pulse/callout/sound, or every page load would replay it for every existing
   * contact. Wiring (onAnyChange/onIncoming) still needs every contact either way, so the plain
   * "contact:added" event keeps firing unconditionally; only the notification-facing
   * "contact:added:live" event is gated on `silent`. */
  addContact(seed: ContactSeed, options: { silent?: boolean } = {}): void {
    if (this.controllers.has(seed.contact.id)) return;
    this.controllers.set(seed.contact.id, new ChatController(seed.contact, seed.messages ?? []));
    this.order.push(seed.contact.id);
    if (this.activeId === undefined) {
      this.activeId = seed.contact.id;
      this.emit("active:changed", seed.contact.id);
    }
    this.emit("contact:added", seed.contact.id);
    if (!options.silent) this.emit("contact:added:live", seed.contact.id);

    const queued = this.pendingEvents.get(seed.contact.id);
    if (queued) {
      this.pendingEvents.delete(seed.contact.id);
      for (const event of queued) this.route(event);
    }
  }

  /** The other side of addContact — a no-op for a contact this tab doesn't (or no longer) know
   * about, so a duplicate contact:removed broadcast (e.g. two tabs racing the same removal) can't
   * throw. Reassigns activeId when the removed contact was active, same as addContact does for
   * the first-contact case. */
  removeContact(contactId: string): void {
    if (!this.controllers.has(contactId)) return;
    this.controllers.delete(contactId);
    this.order = this.order.filter((id) => id !== contactId);
    this.pendingEvents.delete(contactId);
    if (this.activeId === contactId) {
      this.activeId = this.order[0];
      if (this.activeId !== undefined) this.emit("active:changed", this.activeId);
    }
    this.emit("contact:removed", contactId);
  }

  getContactIds(): string[] {
    return this.order;
  }

  getController(id: string): ChatController | undefined {
    return this.controllers.get(id);
  }

  /** undefined until at least one contact exists — see addContact. */
  getActiveController(): ChatController | undefined {
    return this.activeId === undefined ? undefined : this.controllers.get(this.activeId);
  }

  getActiveId(): string | undefined {
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

  /** Subscribes to every controller plus active-contact changes; returns one combined unsubscribe.
   * Contacts are no longer all present at construction (see addContact) — a contact added after
   * this call still needs to be wired up, via the contact:added event, or its state changes would
   * silently never trigger callback. */
  onAnyChange(callback: () => void): () => void {
    const unsubscribes = new Map(this.order.map((id) => [id, this.controllers.get(id)!.on("state:changed", callback)]));
    const unsubscribeActive = this.on("active:changed", callback);
    const unsubscribeAdded = this.on("contact:added", (id) => {
      if (!unsubscribes.has(id)) unsubscribes.set(id, this.controllers.get(id)!.on("state:changed", callback));
      callback();
    });
    const unsubscribeRemoved = this.on("contact:removed", (id) => {
      unsubscribes.get(id)?.();
      unsubscribes.delete(id);
      callback();
    });
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribeActive();
      unsubscribeAdded();
      unsubscribeRemoved();
    };
  }

  /** Fires only for a genuinely new pairing happening live in this tab — not for contacts this
   * tab is merely learning about (construction seeds, the initial contacts:request-list fetch
   * both pass `silent: true` to addContact) — used to drive the FAB pulse/callout/sound exactly
   * once per real pairing, instead of replaying it for every already-known contact on reload. */
  onContactAdded(callback: (contactId: string) => void): () => void {
    return this.on("contact:added:live", callback);
  }

  /** Fires whenever any conversation receives a new incoming message — used to drive the FAB
   * pulse/sound. Same "contact added after subscription" concern as onAnyChange above. */
  onIncoming(callback: (contactId: string) => void): () => void {
    const unsubscribes = new Map(
      this.order.map((id) => [id, this.controllers.get(id)!.on("message:incoming", () => callback(id))]),
    );
    const unsubscribeAdded = this.on("contact:added", (id) => {
      if (!unsubscribes.has(id)) {
        unsubscribes.set(
          id,
          this.controllers.get(id)!.on("message:incoming", () => callback(id)),
        );
      }
    });
    const unsubscribeRemoved = this.on("contact:removed", (id) => {
      unsubscribes.get(id)?.();
      unsubscribes.delete(id);
    });
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribeAdded();
      unsubscribeRemoved();
    };
  }

  /** Active contact only ever changes via explicit setActive — never automatically on an incoming message. */
  route(event: InboundFromBackground): void {
    if (event.type === "contact:added") {
      this.addContact({
        contact: { id: event.contactId, name: event.name || defaultContactName(event.contactId), status: "offline", connected: true },
      });
      return;
    }
    if (event.type === "contact:removed") {
      this.removeContact(event.contactId);
      return;
    }

    const contactId = eventContactId(event);
    if (contactId !== undefined && !this.controllers.has(contactId)) {
      // Not necessarily wrong — this tab's initial contact fetch may just not have resolved yet
      // (see pendingEvents' doc comment) — hold onto it instead of dropping it.
      const queue = this.pendingEvents.get(contactId) ?? [];
      queue.push(event);
      if (queue.length > MAX_PENDING_EVENTS_PER_CONTACT) queue.shift();
      this.pendingEvents.set(contactId, queue);
      return;
    }

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
        controller.receiveMessage(event.message.text, event.message.id, event.message.timestamp);
        break;
      }
      case "chat:remote-typing":
        this.controllers.get(event.contactId)?.applyRemoteTyping(event.state);
        break;
      case "presence:contact":
        this.controllers.get(event.contactId)?.setPresence(event.status);
        break;
      case "contact:disconnected":
        this.controllers.get(event.contactId)?.setConnected(false);
        break;
      case "contact:renamed":
        this.controllers.get(event.contactId)?.renameContact(event.name);
        break;
      default:
        break;
    }
  }
}
