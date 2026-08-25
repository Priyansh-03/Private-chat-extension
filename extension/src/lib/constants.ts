/** id of the shadow-DOM host the content script mounts into — shared so the background script
 * can recognize (and clean up) a stale instance left over from before an extension reload. */
export const OVERLAY_HOST_ID = "private-chat-overlay-host";
