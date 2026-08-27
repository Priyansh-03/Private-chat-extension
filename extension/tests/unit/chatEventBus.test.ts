import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatController } from "../../src/lib/chatEventBus";
import type { ChatMessage, Contact } from "../../src/lib/types";

const contact: Contact = { id: "a", name: "Alex", status: "offline", connected: true };

describe("ChatController.sendMessage", () => {
  beforeEach(() => {
    (globalThis.chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("sends freely with no message-request gating — first message included", () => {
    const controller = new ChatController(contact, []);
    controller.sendMessage("first");
    controller.sendMessage("second");

    const messages = controller.getState().messages;
    expect(messages).toHaveLength(2); // exactly the two sent — no injected system notices
    expect(messages.map((m) => m.text)).toEqual(["first", "second"]);
  });

  it("ignores blank input", () => {
    const controller = new ChatController(contact, []);
    controller.sendMessage("   ");
    expect(controller.getState().messages).toHaveLength(0);
  });
});

describe("ChatController.setConnected", () => {
  it("updates contact.connected and emits connected:changed", () => {
    const controller = new ChatController(contact, []);
    const callback = vi.fn();
    controller.on("connected:changed", callback);

    controller.setConnected(false);

    expect(controller.getState().contact.connected).toBe(false);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("is a no-op when already at that value — no redundant re-render", () => {
    const controller = new ChatController(contact, []);
    const callback = vi.fn();
    controller.on("connected:changed", callback);

    controller.setConnected(true); // already true

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("ChatController.receiveMessage", () => {
  it("dedupes a repeated messageId instead of rendering it twice", () => {
    const controller = new ChatController(contact, []);
    controller.receiveMessage("hello", "msg-1", 1000);
    controller.receiveMessage("hello", "msg-1", 1000); // e.g. a resend after a dropped ack

    expect(controller.getState().messages).toHaveLength(1);
  });

  it("accepts two different messageIds normally", () => {
    const controller = new ChatController(contact, []);
    controller.receiveMessage("hi", "msg-1", 1000);
    controller.receiveMessage("there", "msg-2", 2000);

    expect(controller.getState().messages).toHaveLength(2);
  });

  it("uses the passed timestamp, not wall-clock-at-call-time", () => {
    const controller = new ChatController(contact, []);
    controller.receiveMessage("old news", "msg-1", 12345);

    expect(controller.getState().messages[0].timestamp).toBe(12345);
  });

  it("sorts by timestamp on insert, regardless of call order", () => {
    const controller = new ChatController(contact, []);
    controller.receiveMessage("second", "msg-2", 2000);
    controller.receiveMessage("first", "msg-1", 1000); // arrives/replays after msg-2, but is older

    expect(controller.getState().messages.map((m) => m.text)).toEqual(["first", "second"]);
  });
});

describe("ChatController.mergeHistory", () => {
  const outgoing: ChatMessage = {
    id: "local-1",
    text: "mine",
    direction: "outgoing",
    timestamp: 1500,
    deliveryState: "sending",
    seen: true,
  };
  const serverMsg = (id: string, timestamp: number, text: string): ChatMessage => ({
    id,
    text,
    direction: "incoming",
    timestamp,
    deliveryState: "delivered",
    seen: false,
  });

  it("adds missing server messages in timestamp order, keeping local ones", () => {
    const controller = new ChatController(contact, [outgoing]);
    controller.mergeHistory([serverMsg("s-1", 1000, "before"), serverMsg("s-2", 2000, "after")]);

    expect(controller.getState().messages.map((m) => m.text)).toEqual(["before", "mine", "after"]);
  });

  it("is a no-op when the server has nothing new — no re-render", () => {
    const controller = new ChatController(contact, [outgoing]);
    const callback = vi.fn();
    controller.on("state:changed", callback);

    controller.mergeHistory([{ ...outgoing }]);

    expect(callback).not.toHaveBeenCalled();
  });

  it("recomputes unread from the merged-in incoming messages", () => {
    const controller = new ChatController(contact, []);
    controller.mergeHistory([serverMsg("s-1", 1000, "a"), serverMsg("s-2", 2000, "b")]);

    expect(controller.getState().unreadCount).toBe(2);
  });
});
