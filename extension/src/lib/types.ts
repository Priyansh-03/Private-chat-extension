export type PresenceStatus = "online" | "offline";

export type ConnectionStatus = "connected" | "connecting" | "problem" | "off";

export interface TemporaryStatus {
  label: string;
  /** epoch ms; null = does not expire on its own */
  expiresAt: number | null;
}

export interface Contact {
  id: string;
  name: string;
  status: PresenceStatus;
  customStatus?: TemporaryStatus | null;
}

export type MessageDirection = "incoming" | "outgoing";

/**
 * sending           — not yet confirmed by the server (clock icon)
 * server_accepted   — server received it, recipient not confirmed yet (single tick)
 * pending_delivery  — server queued it because the recipient is offline (still single tick)
 * delivered         — recipient's extension acknowledged receipt (double tick, gray)
 * read              — recipient intentionally revealed the message (double tick, blue)
 * failed            — server was unreachable and retries were exhausted
 */
export type MessageDeliveryState =
  | "sending"
  | "server_accepted"
  | "pending_delivery"
  | "delivered"
  | "read"
  | "failed";

export interface ChatMessage {
  id: string;
  text: string;
  direction: MessageDirection;
  timestamp: number;
  deliveryState: MessageDeliveryState;
  readAt?: number;
}

export type TypingState = "idle" | "typing";

export interface ChatState {
  contact: Contact;
  messages: ChatMessage[];
  unreadCount: number;
  draft: string;
  remoteTyping: TypingState;
}

export type ChatBusEvents = {
  "state:changed": ChatState;
  "message:incoming": ChatMessage;
  "message:outgoing": ChatMessage;
  "presence:changed": PresenceStatus;
};

export type ThemeMode = "system" | "light" | "dark" | "transparent";

export interface ShortcutMap {
  toggleHide: string;
  openPeek: string;
  instantHide: string;
}

export interface Settings {
  extensionEnabled: boolean;
  quietMode: boolean;
  privacyMode: boolean;
  theme: ThemeMode;
  sound: boolean;
  showStatus: boolean;
  quickReplies: string[];
  shortcuts: ShortcutMap;
}

export const DEFAULT_SETTINGS: Settings = {
  extensionEnabled: true,
  quietMode: false,
  privacyMode: true,
  theme: "system",
  sound: true,
  showStatus: true,
  quickReplies: ["Hi", "In a meeting", "TTYL", "See you"],
  shortcuts: {
    toggleHide: "Alt+Shift+C",
    openPeek: "Alt+Shift+P",
    instantHide: "Escape",
  },
};

export type DisclosureMode = "hidden" | "peek" | "full";
