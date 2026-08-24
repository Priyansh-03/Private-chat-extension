import { useEffect } from "react";
import { normalizeCombo } from "../../lib/keyboardCombo";
import type { ShortcutMap } from "../../lib/types";

function isEditingHostPage(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

interface ShortcutHandlers {
  toggleHide: () => void;
  openPeek: () => void;
}

/** Escape/instant-hide is handled separately in useChatDisclosure and always works. */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditingHostPage(event.target)) return;
      const combo = normalizeCombo(event);
      if (combo === shortcuts.toggleHide) {
        event.preventDefault();
        handlers.toggleHide();
      } else if (combo === shortcuts.openPeek) {
        event.preventDefault();
        handlers.openPeek();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shortcuts.toggleHide, shortcuts.openPeek, handlers]);
}
