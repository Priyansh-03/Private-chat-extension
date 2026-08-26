import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { MESSAGE_MAX_CHARS } from "../lib/limits";
import { clamp } from "../lib/geometry";
import { EmojiPicker } from "./EmojiPicker";
import { EmojiPickerBoundary } from "./EmojiPickerBoundary";
import { QuickReplies } from "./QuickReplies";
import { MessageOverflowLayer } from "./MessageOverflowLayer";

const EMOJI_POPOVER_WIDTH = 280;

interface ComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  privacyMode: boolean;
  quickReplies: string[];
  onFocusChange: (focused: boolean) => void;
  emojiTheme: "light" | "dark" | "auto";
  portalRef: RefObject<HTMLDivElement | null>;
  showQuickReplies?: boolean;
  compact?: boolean;
}

export function Composer({
  draft,
  onDraftChange,
  onSend,
  privacyMode,
  quickReplies,
  onFocusChange,
  emojiTheme,
  portalRef,
  showQuickReplies = true,
  compact = false,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);

  const revealed = !privacyMode || focused || hovered;
  const overLimit = draft.length > MESSAGE_MAX_CHARS;
  const showOverflowLayer = revealed && overLimit;

  const syncOverlayScroll = () => {
    if (inputRef.current && overlayRef.current) overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  useEffect(syncOverlayScroll, [draft, showOverflowLayer]);

  const submit = () => {
    if (!draft.trim() || overLimit) return;
    onSend(draft);
    setPickerOpen(false);
  };

  const togglePicker = () => {
    setPickerOpen((prev) => {
      const next = !prev;
      if (next) {
        const rect = emojiWrapRef.current?.getBoundingClientRect();
        if (rect) {
          setPickerAnchor({
            left: clamp(rect.left, 8, window.innerWidth - EMOJI_POPOVER_WIDTH - 8),
            bottom: window.innerHeight - rect.top + 8,
          });
        }
      }
      return next;
    });
  };

  // Popover portals out of this panel (see .pco-portal-layer), so "outside" means outside BOTH the button and the portaled popover.
  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (emojiWrapRef.current && path.includes(emojiWrapRef.current)) return;
      if (emojiPopoverRef.current && path.includes(emojiPopoverRef.current)) return;
      setPickerOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [pickerOpen]);

  return (
    <div className={`pco-composer${compact ? " pco-composer--compact" : ""}`}>
      {showQuickReplies && <QuickReplies replies={quickReplies} onSelect={onSend} />}
      <div className="pco-input-row">
        <div className="pco-emoji-wrap" ref={emojiWrapRef}>
          <button type="button" className="pco-icon-btn" aria-label="Emoji" onClick={togglePicker}>
            😊
          </button>
        </div>
        {pickerOpen &&
          pickerAnchor &&
          portalRef.current &&
          createPortal(
            <div
              className="pco-emoji-popover"
              ref={emojiPopoverRef}
              style={{ left: pickerAnchor.left, bottom: pickerAnchor.bottom }}
            >
              <EmojiPickerBoundary>
                <EmojiPicker
                  theme={emojiTheme}
                  onSelect={(emoji) => {
                    onDraftChange(draft + emoji);
                    inputRef.current?.focus();
                  }}
                />
              </EmojiPickerBoundary>
            </div>,
            portalRef.current,
          )}
        <div className="pco-input-wrap">
          <input
            ref={inputRef}
            type={revealed ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            className="pco-input"
            style={showOverflowLayer ? { color: "transparent", caretColor: "var(--pco-text)" } : undefined}
            placeholder="Type a message..."
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onScroll={syncOverlayScroll}
            onFocus={() => {
              setFocused(true);
              onFocusChange(true);
            }}
            onBlur={() => {
              setFocused(false);
              onFocusChange(false);
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          {showOverflowLayer && (
            <div className="pco-input-overlay" ref={overlayRef} aria-hidden>
              <MessageOverflowLayer text={draft} maxChars={MESSAGE_MAX_CHARS} />
            </div>
          )}
        </div>
        <button type="button" className="pco-send-btn" aria-label="Send message" onClick={submit} disabled={!draft.trim() || overLimit}>
          ➤
        </button>
      </div>
    </div>
  );
}
