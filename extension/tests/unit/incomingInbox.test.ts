import { describe, expect, it } from "vitest";
import * as inbox from "../../src/background/incomingInbox";

describe("incomingInbox", () => {
  it("enqueues and drains all entries", async () => {
    await inbox.enqueue({ contactId: "a", message: { id: "m1", text: "hi", timestamp: 1 } });
    await inbox.enqueue({ contactId: "b", message: { id: "m2", text: "yo", timestamp: 2 } });

    const drained = await inbox.drainAll();
    expect(drained).toHaveLength(2);
  });

  it("drainAll clears the queue — a second drain comes back empty", async () => {
    await inbox.enqueue({ contactId: "a", message: { id: "m1", text: "hi", timestamp: 1 } });

    expect(await inbox.drainAll()).toHaveLength(1);
    expect(await inbox.drainAll()).toEqual([]);
  });

  it("does not duplicate an entry with the same message id", async () => {
    await inbox.enqueue({ contactId: "a", message: { id: "m1", text: "first", timestamp: 1 } });
    await inbox.enqueue({ contactId: "a", message: { id: "m1", text: "different", timestamp: 2 } });

    const drained = await inbox.drainAll();
    expect(drained).toHaveLength(1);
    expect(drained[0].message.text).toBe("first"); // first write wins, not overwritten
  });

  it("dequeue removes only the matching message id", async () => {
    await inbox.enqueue({ contactId: "a", message: { id: "m1", text: "hi", timestamp: 1 } });
    await inbox.enqueue({ contactId: "a", message: { id: "m2", text: "yo", timestamp: 2 } });

    await inbox.dequeue("m1");

    const drained = await inbox.drainAll();
    expect(drained).toHaveLength(1);
    expect(drained[0].message.id).toBe("m2");
  });
});
