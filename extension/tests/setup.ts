import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

/** Minimal chrome.* mock covering what src/lib and src/background actually call — not a full
 * chrome-types shim, just storage.local (Promise-based get/set, matching MV3) and a
 * jest.fn()-backed runtime.sendMessage/onMessage pair tests can configure per-case. */
function createChromeMock() {
  const store = new Map<string, unknown>();
  return {
    storage: {
      local: {
        get: vi.fn(async (key?: string | string[]) => {
          if (key === undefined) return Object.fromEntries(store);
          const keys = Array.isArray(key) ? key : [key];
          const result: Record<string, unknown> = {};
          for (const k of keys) if (store.has(k)) result[k] = store.get(k);
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
      },
      sync: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      lastError: undefined,
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
    },
  };
}

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = createChromeMock();
});

afterEach(() => {
  vi.restoreAllMocks();
});
