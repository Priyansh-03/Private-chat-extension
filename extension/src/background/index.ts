import { USE_REAL_BACKEND } from "../lib/backendConfig";
import { OVERLAY_HOST_ID } from "../lib/constants";
import { loadSettings } from "../lib/settingsStore";
import type { OutboundToBackground } from "../lib/transportProtocol";
import { backendTransport } from "./backendTransport";
import type { ChatTransport } from "./chatTransport";
import { mockTransport } from "./mockTransport";

const transport: ChatTransport = USE_REAL_BACKEND ? backendTransport : mockTransport;

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
    await transport.start();
  } else {
    transport.stop();
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
        void transport.handleOutgoing(message.contactId, message.messageId, message.text, tabId);
      }
      return false;
    }
    case "chat:typing": {
      void transport.handleTyping(message.contactId, message.state);
      return false;
    }
    case "chat:read-ack": {
      void transport.handleReadAck(message.contactId, message.messageId, message.readAt);
      return false;
    }
    case "chat:request-status": {
      sendResponse({ type: "connection:status", status: transport.getStatus() });
      return false;
    }
    case "contact:create-invite": {
      if (!USE_REAL_BACKEND) {
        sendResponse({ ok: false, error: "Pairing needs the real backend (USE_REAL_BACKEND build)." });
        return false;
      }
      void backendTransport.createInvite().then(sendResponse);
      return true;
    }
    case "contact:accept-invite": {
      if (!USE_REAL_BACKEND) {
        sendResponse({ ok: false, error: "Pairing needs the real backend (USE_REAL_BACKEND build)." });
        return false;
      }
      void backendTransport.acceptInvite(message.code, message.displayName).then(sendResponse);
      return true;
    }
    case "contacts:request-list": {
      if (!USE_REAL_BACKEND) {
        sendResponse([]);
        return false;
      }
      void backendTransport.getContactsSnapshot().then(sendResponse);
      return true;
    }
    case "contact:remove": {
      void transport.removeContact(message.contactId).then(sendResponse);
      return true;
    }
    case "chat:request-pending": {
      void transport.drainPendingIncoming().then(sendResponse);
      return true;
    }
    default:
      return false;
  }
});
