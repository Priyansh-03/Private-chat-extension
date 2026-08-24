import { useEffect, useState, type RefObject } from "react";
import { computeAnchor, type Anchor, type Size } from "../../lib/geometry";

const FALLBACK: Anchor = { left: 0, top: 0, openUp: true, openLeft: true };

/** Recomputes the panel's position relative to the FAB whenever it opens, resizes, or the viewport resizes. */
export function usePanelAnchor(
  isOpen: boolean,
  fabRef: RefObject<HTMLElement | null>,
  size: Size,
): Anchor {
  const [anchor, setAnchor] = useState<Anchor>(FALLBACK);

  useEffect(() => {
    if (!isOpen || !fabRef.current) return;

    const recompute = () => {
      if (!fabRef.current) return;
      setAnchor(computeAnchor(fabRef.current.getBoundingClientRect(), size));
    };

    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [isOpen, size.width, size.height, fabRef]);

  return anchor;
}
