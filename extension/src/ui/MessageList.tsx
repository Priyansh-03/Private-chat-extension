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
}

export function MessageList({ messages, privacyMode, onRetry, onRevealMessage, remoteTyping, contactName }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, remoteTyping]);

  return (
    <div className="pco-message-list">
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
