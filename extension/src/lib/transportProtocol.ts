import type { ConnectionStatus, PresenceStatus, TypingState } from "./types";

/** Content script -> background, stand-in for what would go out over a real WebSocket. */
export type OutboundToBackground =
  | { type: "chat:outgoing"; contactId: string; messageId: string; text: string }
  | { type: "chat:typing"; contactId: string; state: TypingState }
  | { type: "chat:request-status" };

/** Background -> every tab's content script, stand-in for real WebSocket frames. */
export type InboundFromBackground =
  | { type: "chat:ack"; contactId: string; messageId: string }
  | { type: "chat:delivered"; contactId: string; messageId: string }
  | { type: "chat:read"; contactId: string; messageId: string; readAt: number }
  | { type: "chat:failed"; contactId: string; messageId: string }
  | { type: "chat:incoming"; contactId: string; message: { id: string; text: string; timestamp: number } }
  | { type: "chat:remote-typing"; contactId: string; state: TypingState }
  | { type: "presence:contact"; contactId: string; status: PresenceStatus }
  | { type: "connection:status"; status: ConnectionStatus };
