import { loadSettings } from "../lib/settingsStore";

/**
 * Best-effort check for "the FAB is already visible to the user right now" — if the browser isn't
 * OS-focused, or the focused tab isn't an ordinary http(s) page (content scripts don't run on
 * chrome://, the Web Store, PDF viewer, etc.), a system notification is the only way the user
 * would find out about the message, so this returns false in every uncertain case.
 */
async function isFabLikelyVisible(): Promise<boolean> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (!win.focused || win.id === undefined) return false;
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: win.id });
    const url = activeTab?.url;
    return !!url && (url.startsWith("http://") || url.startsWith("https://"));
  } catch {
    return false;
  }
}

/**
 * Same content as FabCallout — a generic nudge, never the sender or message text, just via the OS
 * notification tray instead of the in-page bubble, for whenever that bubble wouldn't be seen.
 */
export async function notifyNewMessage(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.pushNotifications || settings.quietMode) return;
  if (await isFabLikelyVisible()) return;

  chrome.notifications.create(
    `pco_message_${Date.now()}`,
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Private Chat",
      message: "You have a new message",
      priority: 1,
    },
    () => void chrome.runtime.lastError,
  );
}

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith("pco_message_")) return;
  chrome.notifications.clear(notificationId);
  void chrome.windows.getLastFocused({ windowTypes: ["normal"] }).then((win) => {
    if (win.id !== undefined) void chrome.windows.update(win.id, { focused: true });
  });
});
