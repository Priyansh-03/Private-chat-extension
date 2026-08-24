import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  theme: "light" | "dark" | "auto";
}

/** emoji-mart with set="native" — renders Unicode glyphs via the OS's own emoji font, no image/network requests. */
export function EmojiPicker({ onSelect, theme }: EmojiPickerProps) {
  return (
    <Picker
      data={data}
      onEmojiSelect={(emoji: { native: string }) => onSelect(emoji.native)}
      set="native"
      theme={theme}
      previewPosition="none"
      skinTonePosition="none"
      navPosition="bottom"
      perLine={7}
      emojiButtonSize={30}
      emojiSize={18}
      maxFrequentRows={1}
    />
  );
}
