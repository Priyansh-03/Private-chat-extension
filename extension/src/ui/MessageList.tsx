import { useEffect, useRef } from "react";
import type { ChatMessage, TypingState } from "../lib/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface MessageListProps {
  messages: ChatMessage[];
  privacyMode: boolean;
  onRetry: (messageId: string) => void;
  onRevealMessage: (messageId: string) => void;
  remoteTyping: TypingState;
  contactName: string;
  /** Peek uses the same list, same content, same behavior as the full panel — just the compact
   * spacing/background that fits its smaller card instead of the sidebar's. */
  compact?: boolean;
}

export function MessageList({
  messages,
  privacyMode,
  onRetry,
  onRevealMessage,
  remoteTyping,
  contactName,
  compact = false,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, remoteTyping]);

  return (
    <div className={`pco-message-list${compact ? " pco-message-list--compact" : ""}`}>
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          privacyMode={privacyMode}
          onRetry={onRetry}
          onRevealMessage={onRevealMessage}
        />
      ))}
      {remoteTyping === "typing" && <TypingIndicator name={contactName} />}
      <div ref={endRef} />
    </div>
  );
}
