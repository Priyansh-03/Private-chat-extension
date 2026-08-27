import type { RemoveContactResponse, RenameContactResponse } from "../lib/transportProtocol";
import type { ChatMessage, ConnectionStatus, TypingState } from "../lib/types";

/** Implemented by both mockTransport (dev/demo, no real backend) and backendTransport (real
 * WebSocket client) so background/index.ts can hold one reference and switch between them
 * behind USE_REAL_BACKEND without branching on which one it has. */
export interface ChatTransport {
  getStatus(): ConnectionStatus;
  start(): Promise<void>;
  stop(): void;
  handleOutgoing(contactId: string, messageId: string, text: string, tabId: number): void | Promise<void>;
  handleTyping(contactId: string, state: TypingState): void | Promise<void>;
  handleReadAck(contactId: string, messageId: string, readAt: number): void | Promise<void>;
  removeContact(contactId: string): Promise<RemoveContactResponse>;
  renameContact(contactId: string, name: string): Promise<RenameContactResponse>;
  /** Full decrypted history for one conversation, from the server's durable (ciphertext-only)
   * store — see backend/docs/protocol.md's GET /messages. Called whenever a tab needs to hydrate
   * a contact's conversation, so every tab (and every device) converges on the same history
   * instead of each tab keeping its own independent in-memory copy. */
  getMessageHistory(contactId: string): Promise<ChatMessage[]>;
}
