// Decrypted messages that arrived while no tab was open (or listening) to receive the live
// broadcast (see backendTransport.ts's chat:incoming handling) — held here instead of being
// silently dropped after chat:delivered-ack was already sent, and replayed into the next tab
// that starts up. Persisted so it survives the background service worker being idle-killed.

import type { PendingIncomingEntry } from "../lib/transportProtocol";

const STORAGE_KEY = "pco_incoming_inbox";

async function loadAll(): Promise<PendingIncomingEntry[]> {
  return ((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as PendingIncomingEntry[] | undefined) ?? [];
}

async function saveAll(items: PendingIncomingEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

export async function enqueue(entry: PendingIncomingEntry): Promise<void> {
  const items = await loadAll();
  if (items.some((item) => item.message.id === entry.message.id)) return;
  items.push(entry);
  await saveAll(items);
}

export async function dequeue(messageId: string): Promise<void> {
  const items = await loadAll();
  const filtered = items.filter((item) => item.message.id !== messageId);
  if (filtered.length !== items.length) await saveAll(filtered);
}

/** Removes and returns everything queued, atomically from the caller's perspective — the first
 * tab to start up after a backlog builds up claims all of it. */
export async function drainAll(): Promise<PendingIncomingEntry[]> {
  const items = await loadAll();
  if (items.length > 0) await saveAll([]);
  return items;
}
