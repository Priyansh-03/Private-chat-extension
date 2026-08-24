export function normalizeCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  if (!["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  }
  return parts.join("+");
}
