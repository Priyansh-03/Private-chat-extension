import type { RefObject } from "react";
import { transformOriginFor, type Anchor } from "../lib/geometry";
import type { ChatMessage, TypingState } from "../lib/types";
import { PrivacyText } from "./PrivacyText";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export const PEEK_SIZE = { width: 300, height: 320 };

interface PeekPanelProps {
  isOpen: boolean;
  instant: boolean;
  anchor: Anchor;
  contactName: string;
  connected: boolean;
  messages: ChatMessage[];
  remoteTyping: TypingState;
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onRetry: (messageId: string) => void;
  onRevealMessage: (messageId: string) => void;
  privacyMode: boolean;
  quickReplies: string[];
  onExpand: () => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onComposerFocusChange: (focused: boolean) => void;
  emojiTheme: "light" | "dark" | "auto";
  portalRef: RefObject<HTMLDivElement | null>;
}

export function PeekPanel({
  isOpen,
  instant,
  anchor,
  contactName,
  connected,
  messages,
  remoteTyping,
  draft,
  onDraftChange,
  onSend,
  onRetry,
  onRevealMessage,
  privacyMode,
  quickReplies,
  onExpand,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onComposerFocusChange,
  emojiTheme,
  portalRef,
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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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

      {connected ? (
        <>
          {messages.length === 0 ? (
            <div className="pco-peek__empty">No messages yet</div>
          ) : (
            <MessageList
              messages={messages}
              privacyMode={privacyMode}
              onRetry={onRetry}
              onRevealMessage={onRevealMessage}
              remoteTyping={remoteTyping}
              contactName={contactName}
              compact
            />
          )}

          <Composer
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            privacyMode={privacyMode}
            quickReplies={quickReplies}
            onFocusChange={onComposerFocusChange}
            emojiTheme={emojiTheme}
            portalRef={portalRef}
            compact
          />
        </>
      ) : (
        // Same "they disconnected you" state as ChatPanel's conversation view — no composer,
        // nothing to send to.
        <div className="pco-disconnected-notice">
          <PrivacyText text={contactName} enabled={privacyMode} /> disconnected
        </div>
      )}
    </div>
  );
}
