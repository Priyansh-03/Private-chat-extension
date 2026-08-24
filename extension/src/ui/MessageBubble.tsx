import type { ChatMessage } from "../lib/types";
import { PrivacyText } from "./PrivacyText";
import { MessageTicks } from "./MessageTicks";

interface MessageBubbleProps {
  message: ChatMessage;
  privacyMode: boolean;
  onRetry: (messageId: string) => void;
}

export function MessageBubble({ message, privacyMode, onRetry }: MessageBubbleProps) {
  return (
    <div className={`pco-bubble-row pco-bubble-row--${message.direction}`}>
      <div className={`pco-bubble pco-bubble--${message.direction}`}>
        <PrivacyText text={message.text} enabled={privacyMode} />
        {message.direction === "outgoing" && (
          <MessageTicks state={message.deliveryState} onRetry={() => onRetry(message.id)} />
        )}
      </div>
    </div>
  );
}
