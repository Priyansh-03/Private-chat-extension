import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "../../src/lib/workspace";
import type { Contact } from "../../src/lib/types";

function contact(id: string, name = id): Contact {
  return { id, name, status: "offline", connected: true };
}

describe("ChatWorkspace", () => {
  beforeEach(() => {
    (globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("starts with no active contact when constructed empty", () => {
    const workspace = new ChatWorkspace([]);
    expect(workspace.getActiveController()).toBeUndefined();
    expect(workspace.getActiveId()).toBeUndefined();
  });

  it("the first added contact becomes active automatically", () => {
    const workspace = new ChatWorkspace([]);
    workspace.addContact({ contact: contact("a") });
    expect(workspace.getActiveId()).toBe("a");
    expect(workspace.getActiveController()?.getState().contact.id).toBe("a");
  });

  it("addContact is idempotent for an already-known contact", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a", "Original Name") }]);
    workspace.addContact({ contact: contact("a", "Different Name") });
    expect(workspace.getController("a")?.getState().contact.name).toBe("Original Name");
    expect(workspace.getContactIds()).toEqual(["a"]);
  });

  it("a contact added after onAnyChange subscription still triggers the callback on its own state changes", () => {
    const workspace = new ChatWorkspace([]);
    const callback = vi.fn();
    workspace.onAnyChange(callback);

    workspace.addContact({ contact: contact("a") });
    expect(callback).toHaveBeenCalled(); // fires immediately for the addition itself
    callback.mockClear();

    workspace.getController("a")!.setDraft("hello");
    expect(callback).toHaveBeenCalled(); // and for state changes on the newly-added controller
  });

  it("a contact added after onIncoming subscription still fires on its incoming messages", () => {
    const workspace = new ChatWorkspace([]);
    const callback = vi.fn();
    workspace.onIncoming(callback);

    workspace.addContact({ contact: contact("a") });
    workspace.getController("a")!.receiveMessage("hi", "msg-1", Date.now());

    expect(callback).toHaveBeenCalledWith("a");
  });

  it("onContactAdded does not fire for construction seeds", () => {
    const callback = vi.fn();
    const workspace = new ChatWorkspace([{ contact: contact("a") }]);
    workspace.onContactAdded(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it("onContactAdded does not fire for a silently-added contact (the initial contacts:request-list fetch)", () => {
    const workspace = new ChatWorkspace([]);
    const callback = vi.fn();
    workspace.onContactAdded(callback);

    workspace.addContact({ contact: contact("a") }, { silent: true });

    expect(callback).not.toHaveBeenCalled();
  });

  it("onContactAdded fires once for a live addContact call", () => {
    const workspace = new ChatWorkspace([]);
    const callback = vi.fn();
    workspace.onContactAdded(callback);

    workspace.addContact({ contact: contact("a") });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("a");
  });

  it("onContactAdded fires for a live route()'d contact:added event, but not again if that contact was already known", () => {
    const workspace = new ChatWorkspace([]);
    const callback = vi.fn();
    workspace.onContactAdded(callback);

    workspace.route({ type: "contact:added", contactId: "a", name: "Alex", publicKey: "pk" });
    expect(callback).toHaveBeenCalledTimes(1);

    // A duplicate live event for a contact this tab already knows about (e.g. a race between
    // the WS push and this tab's own initial fetch) must not replay the notification.
    workspace.route({ type: "contact:added", contactId: "a", name: "Alex", publicKey: "pk" });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("silently re-adding an already-known contact is still a no-op, matching addContact's existing idempotency", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a", "Original Name") }]);
    workspace.addContact({ contact: contact("a", "Different Name") }, { silent: true });
    expect(workspace.getController("a")?.getState().contact.name).toBe("Original Name");
  });

  it("route() dispatches contact:disconnected to the matching controller's setConnected(false)", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a") }]);
    workspace.route({ type: "contact:disconnected", contactId: "a" });
    expect(workspace.getController("a")?.getState().contact.connected).toBe(false);
  });

  it("route() dispatches contact:renamed to the matching controller's renameContact", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a", "Original") }]);
    workspace.route({ type: "contact:renamed", contactId: "a", name: "New Name" });
    expect(workspace.getController("a")?.getState().contact.name).toBe("New Name");
  });

  it("route() dispatches contact:added to addContact", () => {
    const workspace = new ChatWorkspace([]);
    workspace.route({ type: "contact:added", contactId: "a", name: "Alex", publicKey: "pk" });
    expect(workspace.getController("a")?.getState().contact.name).toBe("Alex");
  });

  it("route() buffers events for unknown contacts without throwing or creating a phantom controller", () => {
    const workspace = new ChatWorkspace([]);
    expect(() => workspace.route({ type: "chat:ack", contactId: "ghost", messageId: "m1" })).not.toThrow();
    expect(workspace.getController("ghost")).toBeUndefined();
    expect(workspace.getContactIds()).toEqual([]);
  });

  it("replays a buffered chat:incoming once the contact arrives — the exact race of a message beating this tab's contacts:request-list fetch", () => {
    const workspace = new ChatWorkspace([]);
    workspace.route({ type: "chat:incoming", contactId: "a", message: { id: "msg-1", text: "hi", timestamp: 0 } });

    // Not lost — just not visible yet, since there's no controller to hold it.
    expect(workspace.getController("a")).toBeUndefined();

    workspace.addContact({ contact: contact("a") });

    const messages = workspace.getController("a")?.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages?.[0].text).toBe("hi");
  });

  it("replays buffered events in order, and only for the contact that arrived", () => {
    const workspace = new ChatWorkspace([]);
    workspace.route({ type: "presence:contact", contactId: "a", status: "online" });
    workspace.route({ type: "chat:incoming", contactId: "a", message: { id: "msg-1", text: "first", timestamp: 0 } });
    workspace.route({ type: "chat:incoming", contactId: "b", message: { id: "msg-2", text: "unrelated", timestamp: 0 } });

    workspace.addContact({ contact: contact("a") });

    const stateA = workspace.getController("a")?.getState();
    expect(stateA?.contact.status).toBe("online");
    expect(stateA?.messages.map((m) => m.text)).toEqual(["first"]);
    expect(workspace.getController("b")).toBeUndefined(); // still buffered, "a" arriving doesn't leak into "b"
  });

  it("removeContact drops the controller and is a no-op for an unknown contact", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a") }]);
    workspace.removeContact("a");
    expect(workspace.getController("a")).toBeUndefined();
    expect(workspace.getContactIds()).toEqual([]);

    expect(() => workspace.removeContact("ghost")).not.toThrow();
  });

  it("removeContact reassigns activeId to another contact, or to undefined if none remain", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a") }, { contact: contact("b") }]);
    expect(workspace.getActiveId()).toBe("a");

    workspace.removeContact("a");
    expect(workspace.getActiveId()).toBe("b");

    workspace.removeContact("b");
    expect(workspace.getActiveId()).toBeUndefined();
    expect(workspace.getActiveController()).toBeUndefined();
  });

  it("route() dispatches contact:removed to removeContact", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a") }]);
    workspace.route({ type: "contact:removed", contactId: "a" });
    expect(workspace.getController("a")).toBeUndefined();
  });

  it("onAnyChange still fires (and stops tracking) when a contact is removed", () => {
    const workspace = new ChatWorkspace([{ contact: contact("a") }]);
    const callback = vi.fn();
    workspace.onAnyChange(callback);

    workspace.removeContact("a");
    expect(callback).toHaveBeenCalled();
  });

  it("caps the per-contact buffer instead of growing unboundedly for a contact that never arrives", () => {
    const workspace = new ChatWorkspace([]);
    for (let i = 0; i < 30; i++) {
      workspace.route({ type: "chat:incoming", contactId: "ghost", message: { id: `msg-${i}`, text: `${i}`, timestamp: 0 } });
    }
    workspace.addContact({ contact: contact("ghost") });
    expect(workspace.getController("ghost")?.getState().messages.length).toBeLessThanOrEqual(20);
  });
});
