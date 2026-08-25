import { OVERLAY_HOST_ID } from "../lib/constants";
import { loadSettings } from "../lib/settingsStore";
import type { OutboundToBackground } from "../lib/transportProtocol";
import { mockTransport } from "./mockTransport";

/**
 * Content scripts only auto-run on new page loads after the extension starts, so tabs already
 * open at install/reload time are otherwise stuck without the FAB until manually refreshed. This
 * pushes it into every currently-open tab instead. Any host element left behind by a now-dead
 * script instance from before the reload is removed first, since mount() would otherwise see it
 * and skip re-mounting. Restricted pages (chrome://, the Web Store, PDF viewer, etc.) just reject
 * the injection — there's nothing to do about those, so failures are silently skipped.
 */
async function injectIntoExistingTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
      .map(async (tab) => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (hostId: string) => document.getElementById(hostId)?.remove(),
            args: [OVERLAY_HOST_ID],
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["dist/content.js"],
          });
        } catch {
          // restricted page; nothing to do
        }
      }),
  );
}

chrome.runtime.onInstalled.addListener(() => {
  void injectIntoExistingTabs();
});

async function syncTransportToSettings(): Promise<void> {
  const settings = await loadSettings();
  if (settings.extensionEnabled) {
    await mockTransport.start();
  } else {
    mockTransport.stop();
  }
}

void syncTransportToSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.pco_settings) {
    void syncTransportToSettings();
  }
});

chrome.runtime.onMessage.addListener((message: OutboundToBackground, sender, sendResponse) => {
  switch (message.type) {
    case "chat:outgoing": {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        void mockTransport.handleOutgoing(message.contactId, message.messageId, message.text, tabId);
      }
      return false;
    }
    case "chat:request-status": {
      sendResponse({ type: "connection:status", status: mockTransport.getStatus() });
      return false;
    }
    case "chat:typing": {
      // No real peer in the mock transport to relay this to; a real backend
      // would forward it over the socket to the other participant.
      return false;
    }
    default:
      return false;
  }
});
