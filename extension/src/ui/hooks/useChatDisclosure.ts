import { useCallback, useEffect, useState, type RefObject } from "react";
import type { DisclosureMode } from "../../lib/types";

export interface DisclosureApi {
  mode: DisclosureMode;
  instant: boolean;
  openPeek: () => void;
  openFull: () => void;
  close: () => void;
  closeInstant: () => void;
}

/** Deliberate open/close only (left/right FAB click, see Overlay.tsx). Escape is instant, everything else animates. */
export function useChatDisclosure(containerRef: RefObject<HTMLElement | null>): DisclosureApi {
  const [mode, setMode] = useState<DisclosureMode>("hidden");
  const [instant, setInstant] = useState(false);

  const openPeek = useCallback(() => {
    setInstant(false);
    setMode((prev) => (prev === "peek" ? "hidden" : "peek"));
  }, []);

  const openFull = useCallback(() => {
    setInstant(false);
    setMode((prev) => (prev === "full" ? "hidden" : "full"));
  }, []);

  const close = useCallback(() => {
    setInstant(false);
    setMode("hidden");
  }, []);

  const closeInstant = useCallback(() => {
    setInstant(true);
    setMode("hidden");
  }, []);

  useEffect(() => {
    if (mode === "hidden") return;

    const handlePointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (containerRef.current && !path.includes(containerRef.current)) {
        close();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeInstant();
    };

    // Capture phase for both — Overlay.tsx's .pco-root now stops keydown/pointerdown from
    // bubbling past it (so a host page's own hotkeys don't fire while typing in this overlay),
    // which would otherwise stop Escape and outside-click-to-close from ever reaching a
    // bubble-phase listener here too. Capture fires on the way down, before that point.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [mode, close, closeInstant, containerRef]);

  return { mode, instant, openPeek, openFull, close, closeInstant };
}
