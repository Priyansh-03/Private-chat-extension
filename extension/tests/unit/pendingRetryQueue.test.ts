import { describe, expect, it } from "vitest";
import * as retryQueue from "../../src/background/pendingRetryQueue";

describe("pendingRetryQueue", () => {
  it("enqueues and lists entries", async () => {
    await retryQueue.enqueue({ contactId: "a", messageId: "m1", ciphertext: "c1", nonce: "n1" });
    await retryQueue.enqueue({ contactId: "b", messageId: "m2", ciphertext: "c2", nonce: "n2" });

    expect(await retryQueue.all()).toHaveLength(2);
    expect(await retryQueue.forContact("a")).toEqual([
      { contactId: "a", messageId: "m1", ciphertext: "c1", nonce: "n1" },
    ]);
  });

  it("does not duplicate an entry with the same messageId", async () => {
    await retryQueue.enqueue({ contactId: "a", messageId: "m1", ciphertext: "c1", nonce: "n1" });
    await retryQueue.enqueue({ contactId: "a", messageId: "m1", ciphertext: "different", nonce: "different" });

    const all = await retryQueue.all();
    expect(all).toHaveLength(1);
    expect(all[0].ciphertext).toBe("c1"); // first write wins, not overwritten
  });

  it("dequeue removes only the matching messageId", async () => {
    await retryQueue.enqueue({ contactId: "a", messageId: "m1", ciphertext: "c1", nonce: "n1" });
    await retryQueue.enqueue({ contactId: "a", messageId: "m2", ciphertext: "c2", nonce: "n2" });

    await retryQueue.dequeue("m1");

    const remaining = await retryQueue.all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].messageId).toBe("m2");
  });
});
