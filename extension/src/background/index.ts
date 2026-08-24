import { loadSettings } from "../lib/settingsStore";
import type { OutboundToBackground } from "../lib/transportProtocol";
import { mockTransport } from "./mockTransport";

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
