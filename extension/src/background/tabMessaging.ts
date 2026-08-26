import type { InboundFromBackground } from "../lib/transportProtocol";

/** Resolves true if a content script was actually there to receive it — callers that fire this
 * without awaiting (the vast majority) get the old best-effort behavior for free; the return
 * value only matters to broadcastToAllTabs and anything that needs to know delivery actually
 * reached a live tab (see backendTransport.ts's incoming-inbox handling). */
export function sendToTab(tabId: number, message: InboundFromBackground): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(!chrome.runtime.lastError); // lastError set = no content script in that tab
    });
  });
}

/** Returns true if at least one open tab actually had a content script listening. */
export async function broadcastToAllTabs(message: InboundFromBackground): Promise<boolean> {
  const tabs = await chrome.tabs.query({});
  const delivered = await Promise.all(
    tabs.filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined).map((tab) => sendToTab(tab.id, message)),
  );
  return delivered.some(Boolean);
}
