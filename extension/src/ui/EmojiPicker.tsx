import { emojiShortcutHint } from "../lib/platformHint";

/**
 * A small curated set, not an exhaustive emoji database — this is the
 * working fallback for systems (many Linux setups included) where there's
 * no OS-level emoji picker bound to a keyboard shortcut. The shortcut hint
 * is still shown for the systems where it does work.
 */
const EMOJIS = ["😊", "😂", "😍", "😉", "😢", "😮", "🙏", "👍", "🔥", "🎉", "❤️", "😴", "🤔", "😎", "😭", "✅"];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  return (
    <div className="pco-emoji-picker">
      <div className="pco-emoji-picker__grid">
        {EMOJIS.map((emoji) => (
          <button key={emoji} type="button" className="pco-emoji-picker__item" onClick={() => onSelect(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
      <div className="pco-emoji-picker__hint">Or: {emojiShortcutHint()}</div>
    </div>
  );
}
