import { DEMO_CONTACTS } from "./demoContacts";
import type { ContactSeed } from "./workspace";
import type { ChatMessage } from "./types";

/** Placeholder contacts + transcripts, verifiable before a real backend exists. See background/mockTransport.ts. */
export function createDemoSeeds(): ContactSeed[] {
  const now = Date.now();

  const alexMessages: ChatMessage[] = [
    { id: "seed_1", text: "Are you free later?", direction: "incoming", timestamp: now - 1000 * 60 * 6, deliveryState: "delivered", seen: true },
    { id: "seed_2", text: "Yeah, why?", direction: "outgoing", timestamp: now - 1000 * 60 * 5, deliveryState: "read", readAt: now - 1000 * 60 * 4.5, seen: true },
    { id: "seed_3", text: "Nothing urgent :)", direction: "incoming", timestamp: now - 1000 * 60 * 4, deliveryState: "delivered", seen: true },
    { id: "seed_4", text: "Okay 😄", direction: "outgoing", timestamp: now - 1000 * 60 * 3, deliveryState: "delivered", seen: true },
  ];

  return DEMO_CONTACTS.map((seed, index) => ({
    contact: { id: seed.id, name: seed.name, status: "online" },
    messages: index === 0 ? alexMessages : [],
  }));
}
