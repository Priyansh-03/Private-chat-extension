import type { Anchor } from "../lib/geometry";

interface FabCalloutProps {
  visible: boolean;
  anchor: Anchor;
  onClick: () => void;
}

export const CALLOUT_SIZE = { width: 190, height: 40 };

/** A generic, content-free nudge toward the FAB — never the sender or message text. Trails toward whichever corner the FAB is on. */
export function FabCallout({ visible, anchor, onClick }: FabCalloutProps) {
  const corner = `${anchor.openUp ? "b" : "t"}${anchor.openLeft ? "r" : "l"}`;
  return (
    <button
      type="button"
      className={`pco-callout pco-callout--${corner}${visible ? " pco-callout--visible" : ""}`}
      style={{ left: anchor.left, top: anchor.top }}
      onClick={onClick}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      You have a new message
    </button>
  );
}
