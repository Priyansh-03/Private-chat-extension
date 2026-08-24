/** The OS-native emoji picker shortcut — no bundled emoji list to keep in sync. */
export function emojiShortcutHint(): string {
  const platform = navigator.platform || navigator.userAgent;
  if (/Mac/i.test(platform)) return "Press Control + Command + Space for emoji";
  if (/Win/i.test(platform)) return "Press Windows + . for emoji";
  return "Use your system emoji picker";
}
