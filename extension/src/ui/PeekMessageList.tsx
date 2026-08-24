import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

interface PeekMessageListProps {
  messages: ChatMessage[];
  privacyMode: boolean;
  onRetry: (messageId: string) => void;
  onRevealMessage: (messageId: string) => void;
}

/** Lands on the oldest message (default scrollTop 0); scrolling down reveals newer ones, with a "more unread" pill while any are still below the fold. */
export function PeekMessageList({ messages, privacyMode, onRetry, onRevealMessage }: PeekMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [hiddenBelow, setHiddenBelow] = useState(0);

  const recomputeHiddenBelow = () => {
    const container = containerRef.current;
    if (!container) return;
    const fold = container.scrollTop + container.clientHeight;
    let count = 0;
    for (const message of messages) {
      const row = rowRefs.current.get(message.id);
      if (row && row.offsetTop >= fold - 1) count += 1;
    }
    setHiddenBelow(count);
  };

  useEffect(recomputeHiddenBelow, [messages]);

  return (
    <div className="pco-peek__messages-wrap">
      <div className="pco-peek__messages" ref={containerRef} onScroll={recomputeHiddenBelow}>
        {messages.map((message) => (
          <div
            key={message.id}
            ref={(el) => {
              if (el) rowRefs.current.set(message.id, el);
              else rowRefs.current.delete(message.id);
            }}
          >
            <MessageBubble message={message} privacyMode={privacyMode} onRetry={onRetry} onRevealMessage={onRevealMessage} />
          </div>
        ))}
      </div>
      {hiddenBelow > 0 && <div className="pco-peek__more-pill">{hiddenBelow} more unread</div>}
    </div>
  );
}
