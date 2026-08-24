import { useEffect, useState } from "react";
import { normalizeCombo } from "../lib/keyboardCombo";
import type { ShortcutMap } from "../lib/types";

interface ShortcutEditorProps {
  shortcuts: ShortcutMap;
  onChange: (shortcuts: ShortcutMap) => void;
}

type ConfigurableAction = "toggleHide" | "openPeek";

const LABELS: Record<ConfigurableAction, string> = {
  toggleHide: "Toggle/Hide current UI",
  openPeek: "Open Peek Mode",
};

export function ShortcutEditor({ shortcuts, onChange }: ShortcutEditorProps) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState<ConfigurableAction | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      // A modifier pressed on its own (Alt, Shift, ...) fires its own keydown
      // first — wait for the actual key that completes the combo (e.g. the
      // "X" in Alt+X) instead of finalizing on the modifier alone.
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      const combo = normalizeCombo(event);
      if (!combo) return;
      onChange({ ...shortcuts, [capturing]: combo });
      setCapturing(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, shortcuts, onChange]);

  return (
    <div className="pcp-row pcp-row--stack">
      <div className="pcp-row__top">
        <span>Keyboard Shortcuts</span>
        <button type="button" className="pcp-btn" onClick={() => setOpen((prev) => !prev)}>
          {open ? "Done" : "Configure"}
        </button>
      </div>
      {open && (
        <div className="pcp-editor">
          {(Object.keys(LABELS) as ConfigurableAction[]).map((action) => (
            <div key={action} className="pcp-shortcut-item">
              <span className="pcp-shortcut-item__label">{LABELS[action]}</span>
              <button type="button" className="pcp-kbd" onClick={() => setCapturing(action)}>
                {capturing === action ? "Press a key…" : shortcuts[action]}
              </button>
            </div>
          ))}
          <div className="pcp-shortcut-item">
            <span className="pcp-shortcut-item__label">Instant Hide</span>
            <span className="pcp-kbd pcp-kbd--fixed">Escape</span>
          </div>
          <p className="pcp-hint">Escape always instant-hides, everywhere, and can&apos;t be reassigned.</p>
        </div>
      )}
    </div>
  );
}
