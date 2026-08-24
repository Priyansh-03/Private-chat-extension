import { transformOriginFor, type Anchor } from "../lib/geometry";
import type { ChatMessage } from "../lib/types";
import { PrivacyText } from "./PrivacyText";
import { MessageTicks } from "./MessageTicks";
import { Composer } from "./Composer";

export const PEEK_SIZE = { width: 300, height: 210 };

interface PeekPanelProps {
  isOpen: boolean;
  instant: boolean;
  anchor: Anchor;
  contactName: string;
  lastMessage: ChatMessage | undefined;
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onRetry: (messageId: string) => void;
  privacyMode: boolean;
  quickReplies: string[];
  onExpand: () => void;
  onClose: () => void;
}

export function PeekPanel({
  isOpen,
  instant,
  anchor,
  contactName,
  lastMessage,
  draft,
  onDraftChange,
  onSend,
  onRetry,
  privacyMode,
  quickReplies,
  onExpand,
  onClose,
}: PeekPanelProps) {
  return (
    <div
      className={`pco-peek${isOpen ? " pco-peek--open" : ""}${instant ? " pco-panel--instant" : ""}`}
      style={{
        width: PEEK_SIZE.width,
        height: PEEK_SIZE.height,
        left: anchor.left,
        top: anchor.top,
        transformOrigin: transformOriginFor(anchor),
      }}
      aria-hidden={!isOpen}
    >
      <div className="pco-peek__top">
        <span className="pco-peek__name">
          <PrivacyText text={contactName} enabled={privacyMode} />
        </span>
        <div className="pco-peek__top-actions">
          <button type="button" className="pco-header__btn" aria-label="Expand to full chat" onClick={onExpand}>
            ⤢
          </button>
          <button type="button" className="pco-header__btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {lastMessage ? (
        <div className={`pco-bubble-row pco-bubble-row--${lastMessage.direction}`}>
          <div className={`pco-bubble pco-bubble--${lastMessage.direction}`}>
            <PrivacyText text={lastMessage.text} enabled={privacyMode} />
            {lastMessage.direction === "outgoing" && (
              <MessageTicks state={lastMessage.deliveryState} onRetry={() => onRetry(lastMessage.id)} />
            )}
          </div>
        </div>
      ) : (
        <div className="pco-peek__empty">No messages yet</div>
      )}

      <Composer
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        privacyMode={privacyMode}
        quickReplies={quickReplies}
        compact
      />
    </div>
  );
}
