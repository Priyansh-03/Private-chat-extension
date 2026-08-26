// Messages the backend reported as `chat:pending` (recipient offline, nothing queued
// server-side — see backend/docs/protocol.md) live here until the contact comes back online.
// Persisted so a retry survives the background service worker being idle-killed and restarted.

const STORAGE_KEY = "pco_pending_sends";

export interface PendingSend {
  contactId: string;
  messageId: string;
  ciphertext: string;
  nonce: string;
}

async function loadAll(): Promise<PendingSend[]> {
  return ((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as PendingSend[] | undefined) ?? [];
}

async function saveAll(items: PendingSend[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

export async function enqueue(entry: PendingSend): Promise<void> {
  const items = await loadAll();
  if (items.some((item) => item.messageId === entry.messageId)) return;
  items.push(entry);
  await saveAll(items);
}

export async function dequeue(messageId: string): Promise<void> {
  const items = await loadAll();
  const filtered = items.filter((item) => item.messageId !== messageId);
  if (filtered.length !== items.length) await saveAll(filtered);
}

export async function forContact(contactId: string): Promise<PendingSend[]> {
  return (await loadAll()).filter((item) => item.contactId === contactId);
}

export async function all(): Promise<PendingSend[]> {
  return loadAll();
}
