import type { PendingIncomingEntry, RemoveContactResponse } from "../lib/transportProtocol";
import type { ConnectionStatus, TypingState } from "../lib/types";

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
  /** Incoming messages that arrived while no tab was open to receive them live — see
   * backendTransport.ts's chat:incoming handling. Draining hands them to the caller and clears
   * them from storage in the same call, so only the first tab to start up after the fact gets them. */
  drainPendingIncoming(): Promise<PendingIncomingEntry[]>;
}
