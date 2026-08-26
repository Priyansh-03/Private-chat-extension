import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatController } from "../../src/lib/chatEventBus";
import type { Contact } from "../../src/lib/types";

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
    controller.receiveMessage("hello", "msg-1");
    controller.receiveMessage("hello", "msg-1"); // e.g. a resend after a dropped ack

    expect(controller.getState().messages).toHaveLength(1);
  });

  it("accepts two different messageIds normally", () => {
    const controller = new ChatController(contact, []);
    controller.receiveMessage("hi", "msg-1");
    controller.receiveMessage("there", "msg-2");

    expect(controller.getState().messages).toHaveLength(2);
  });
});
