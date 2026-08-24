import { useCallback, useRef, useState } from "react";
import { clamp } from "../../lib/geometry";

const MIN_WIDTH = 300;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 380;

export interface SidebarWidthApi {
  width: number;
  isResizing: boolean;
  onHandlePointerDown: (event: React.PointerEvent) => void;
}

/** The sidebar is pinned to the right edge, so its resize handle sits on the left edge — dragging left widens it. */
export function useSidebarWidth(): SidebarWidthApi {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const dragOrigin = useRef({ x: 0, width: 0 });

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      dragOrigin.current = { x: event.clientX, width };
      setIsResizing(true);

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - dragOrigin.current.x;
        setWidth(clamp(dragOrigin.current.width - deltaX, MIN_WIDTH, MAX_WIDTH));
      };

      const handleUp = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [width],
  );

  return { width, isResizing, onHandlePointerDown };
}
