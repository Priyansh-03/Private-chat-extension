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
};

export type ThemeMode = "system" | "light" | "dark" | "transparent";

export type NotificationSound = "chime" | "pop" | "ding";

export type MyStatusPreset = "available" | "busy" | "meeting" | "dnd" | "afk";

export const MY_STATUS_LABELS: Record<MyStatusPreset, string> = {
  available: "Available",
  busy: "Busy",
  meeting: "In a meeting",
  dnd: "Do not disturb",
  afk: "AFK",
};

export interface Settings {
  extensionEnabled: boolean;
  quietMode: boolean;
  privacyMode: boolean;
  theme: ThemeMode;
  sound: boolean;
  notificationSound: NotificationSound;
  showStatus: boolean;
  quickReplies: string[];
  myStatus: MyStatusPreset;
}

export const DEFAULT_SETTINGS: Settings = {
  extensionEnabled: true,
  quietMode: false,
  privacyMode: true,
  theme: "system",
  sound: true,
  notificationSound: "chime",
  showStatus: true,
  quickReplies: ["Hi", "In a meeting", "TTYL", "See you"],
  myStatus: "available",
};

export type DisclosureMode = "hidden" | "peek" | "full";
