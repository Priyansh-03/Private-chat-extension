export interface Size {
  width: number;
  height: number;
}

export interface Anchor {
  left: number;
  top: number;
  openUp: boolean;
  openLeft: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Positions the panel adjacent to the FAB, flipping toward whichever
 * quadrant of the viewport has room, then clamps it fully on-screen.
 */
export function transformOriginFor(anchor: Anchor): string {
  return `${anchor.openLeft ? "right" : "left"} ${anchor.openUp ? "bottom" : "top"}`;
}

export function computeAnchor(fabRect: DOMRect, size: Size, gap = 14): Anchor {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fabCenterX = fabRect.left + fabRect.width / 2;
  const fabCenterY = fabRect.top + fabRect.height / 2;
  const openLeft = fabCenterX > vw / 2;
  const openUp = fabCenterY > vh / 2;

  const rawLeft = openLeft ? fabRect.right - size.width : fabRect.left;
  const rawTop = openUp ? fabRect.top - gap - size.height : fabRect.bottom + gap;

  return {
    left: clamp(rawLeft, gap, Math.max(gap, vw - size.width - gap)),
    top: clamp(rawTop, gap, Math.max(gap, vh - size.height - gap)),
    openUp,
    openLeft,
  };
}
