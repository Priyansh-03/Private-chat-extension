export type PresenceStatus = "online" | "offline";

export type ConnectionStatus = "connected" | "connecting" | "problem" | "off";

export interface Contact {
  id: string;
  name: string;
  status: PresenceStatus;
  /** False once the *other* side has disconnected you — you keep them in your own list, but can
   * no longer chat with them (see backend/docs/protocol.md's DELETE /contacts). */
  connected: boolean;
}

/** A paired contact has no server-known "real name" — display_name defaults to "" until someone
 * sets it (the inviter's side always starts this way; see backend/src/routes/pairing.py). Used
 * everywhere a Contact gets constructed from backend data, so an empty name never reaches the UI —
 * one canonical fallback format instead of scattered blank-checks at render time. */
export function defaultContactName(contactId: string): string {
  return `Contact ${contactId.slice(0, 8)}`;
}

export type MessageDirection = "incoming" | "outgoing";

/** sending -> server_accepted/pending_delivery (1 tick) -> delivered (2 gray) -> read (2 blue), or failed */
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
  /** incoming: has the user hovered/revealed it locally? outgoing: always true, unused */
  seen: boolean;
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
  "connected:changed": boolean;
};

export type ThemeMode = "system" | "light" | "dark" | "transparent";

export type NotificationSound = "chime" | "pop" | "ding" | "tick";

export interface Settings {
  extensionEnabled: boolean;
  showFab: boolean;
  quietMode: boolean;
  privacyMode: boolean;
  theme: ThemeMode;
  sound: boolean;
  notificationSound: NotificationSound;
  /** Plays instead of notificationSound when a message arrives in the conversation already open. */
  activeChatSound: boolean;
  activeChatSoundKind: NotificationSound;
  pushNotifications: boolean;
  showStatus: boolean;
  quickReplies: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  extensionEnabled: true,
  showFab: true,
  quietMode: false,
  privacyMode: true,
  theme: "system",
  sound: true,
  notificationSound: "chime",
  activeChatSound: true,
  activeChatSoundKind: "tick",
  pushNotifications: true,
  showStatus: true,
  quickReplies: ["Hi", "In a meeting", "TTYL", "See you"],
};

export type DisclosureMode = "hidden" | "peek" | "full";
