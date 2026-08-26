import { describe, expect, it } from "vitest";
import { defaultContactName } from "../../src/lib/types";

describe("defaultContactName", () => {
  it("truncates to the first 8 characters of the id", () => {
    expect(defaultContactName("c5b9e856-c170-4a89-99ba-56dd44878d75")).toBe("Contact c5b9e856");
  });

  it("handles short ids without throwing", () => {
    expect(defaultContactName("abc")).toBe("Contact abc");
  });
});
