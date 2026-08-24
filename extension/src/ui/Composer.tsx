import { useEffect, useRef, useState } from "react";
import { EmojiPicker } from "./EmojiPicker";
import { QuickReplies } from "./QuickReplies";

interface ComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  privacyMode: boolean;
  quickReplies: string[];
  showQuickReplies?: boolean;
  compact?: boolean;
}

export function Composer({
  draft,
  onDraftChange,
  onSend,
  privacyMode,
  quickReplies,
  showQuickReplies = true,
  compact = false,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  const revealed = !privacyMode || focused || hovered;

  const submit = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setPickerOpen(false);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (emojiWrapRef.current && !event.composedPath().includes(emojiWrapRef.current)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [pickerOpen]);

  return (
    <div className={`pco-composer${compact ? " pco-composer--compact" : ""}`}>
      {showQuickReplies && <QuickReplies replies={quickReplies} onSelect={onSend} />}
      <div className="pco-input-row">
        <div className="pco-emoji-wrap" ref={emojiWrapRef}>
          <button
            type="button"
            className="pco-icon-btn"
            aria-label="Emoji"
            onClick={() => setPickerOpen((prev) => !prev)}
          >
            😊
          </button>
          {pickerOpen && (
            <EmojiPicker
              onSelect={(emoji) => {
                onDraftChange(draft + emoji);
                inputRef.current?.focus();
              }}
            />
          )}
        </div>
        <input
          ref={inputRef}
          type={revealed ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          className="pco-input"
          placeholder="Type a message..."
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button
          type="button"
          className="pco-send-btn"
          aria-label="Send message"
          onClick={submit}
          disabled={!draft.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
