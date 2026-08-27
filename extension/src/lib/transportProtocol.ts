import type { ChatMessage, ConnectionStatus, PresenceStatus, TypingState } from "./types";

/** Content script -> background, stand-in for what would go out over a real WebSocket. */
export type OutboundToBackground =
  | { type: "chat:outgoing"; contactId: string; messageId: string; text: string }
  | { type: "chat:typing"; contactId: string; state: TypingState }
  | { type: "chat:read-ack"; contactId: string; messageId: string; readAt: number }
  | { type: "chat:request-status" }
  | { type: "contacts:request-list" }
  | { type: "contact:create-invite" }
  | { type: "contact:accept-invite"; code: string; displayName: string }
  | { type: "contact:remove"; contactId: string }
  | { type: "contact:rename"; contactId: string; name: string }
  | { type: "chat:request-history"; contactId: string };

/** Background -> every tab's content script, stand-in for real WebSocket frames. */
export type InboundFromBackground =
  | { type: "chat:ack"; contactId: string; messageId: string }
  | { type: "chat:delivered"; contactId: string; messageId: string }
  | { type: "chat:read"; contactId: string; messageId: string; readAt: number }
  | { type: "chat:failed"; contactId: string; messageId: string }
  | { type: "chat:incoming"; contactId: string; message: { id: string; text: string; timestamp: number } }
  | { type: "chat:remote-typing"; contactId: string; state: TypingState }
  | { type: "presence:contact"; contactId: string; status: PresenceStatus }
  | { type: "connection:status"; status: ConnectionStatus }
  | { type: "contact:added"; contactId: string; name: string; publicKey: string }
  | { type: "contact:removed"; contactId: string }
  | { type: "contact:disconnected"; contactId: string }
  | { type: "contact:renamed"; contactId: string; name: string };

/** Responses to the request/response-shaped OutboundToBackground messages above (via sendResponse). */
export type CreateInviteResponse =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: string };

export type AcceptInviteResponse =
  | { ok: true; contactId: string; name: string }
  | { ok: false; error: string };

export type RemoveContactResponse = { ok: true } | { ok: false; error: string };

export type RenameContactResponse = { ok: true } | { ok: false; error: string };

/** Response to chat:request-history — already decrypted, ready to seed a ChatController. */
export type MessageHistoryResponse = ChatMessage[];

export interface RemoteContactSnapshot {
  contactId: string;
  name: string;
  publicKey: string;
  status: PresenceStatus;
  connected: boolean;
}
