import type { ChatMessage } from "../lib/types";
import { PrivacyText } from "./PrivacyText";
import { MessageTicks } from "./MessageTicks";

interface MessageBubbleProps {
  message: ChatMessage;
  privacyMode: boolean;
  onRetry: (messageId: string) => void;
  onRevealMessage: (messageId: string) => void;
}

export function MessageBubble({ message, privacyMode, onRetry, onRevealMessage }: MessageBubbleProps) {
  const isUnseenIncoming = message.direction === "incoming" && !message.seen;
  return (
    <div className={`pco-bubble-row pco-bubble-row--${message.direction}`}>
      <div className={`pco-bubble pco-bubble--${message.direction}`}>
        <PrivacyText
          text={message.text}
          enabled={privacyMode}
          onReveal={isUnseenIncoming ? () => onRevealMessage(message.id) : undefined}
        />
        {message.direction === "outgoing" && (
          <MessageTicks state={message.deliveryState} onRetry={() => onRetry(message.id)} />
        )}
      </div>
    </div>
  );
}
