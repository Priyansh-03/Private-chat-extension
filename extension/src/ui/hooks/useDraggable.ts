import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "../../lib/geometry";
import { loadFabPosition, saveFabPosition } from "../../lib/settingsStore";

export const FAB_SIZE = 52;
const MARGIN = 20;
const DRAG_THRESHOLD = 4;

interface Position {
  x: number;
  y: number;
}

function defaultPosition(): Position {
  return {
    x: window.innerWidth - FAB_SIZE - MARGIN,
    y: window.innerHeight - FAB_SIZE - MARGIN - 60,
  };
}

export interface DraggableApi {
  position: Position;
  onPointerDown: (event: React.PointerEvent) => void;
  consumeDragged: () => boolean;
}

/** Free-drag positioning for the FAB, persisted across pages/sessions via chrome.storage.local. */
export function useDraggable(): DraggableApi {
  const [position, setPosition] = useState<Position>(defaultPosition);
  const dragOrigin = useRef({ pointerX: 0, pointerY: 0, startX: 0, startY: 0 });
  const draggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadFabPosition().then((saved) => {
      if (!cancelled && saved) {
        setPosition({
          x: clamp(saved.x, MARGIN, window.innerWidth - FAB_SIZE - MARGIN),
          y: clamp(saved.y, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const clampToViewport = () => {
      setPosition((prev) => ({
        x: clamp(prev.x, MARGIN, window.innerWidth - FAB_SIZE - MARGIN),
        y: clamp(prev.y, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
      }));
    };
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      draggedRef.current = false;
      dragOrigin.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: position.x,
        startY: position.y,
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - dragOrigin.current.pointerX;
        const dy = moveEvent.clientY - dragOrigin.current.pointerY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          draggedRef.current = true;
        }
        setPosition({
          x: clamp(dragOrigin.current.startX + dx, MARGIN, window.innerWidth - FAB_SIZE - MARGIN),
          y: clamp(dragOrigin.current.startY + dy, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        if (draggedRef.current) {
          const dx = upEvent.clientX - dragOrigin.current.pointerX;
          const dy = upEvent.clientY - dragOrigin.current.pointerY;
          void saveFabPosition({
            x: clamp(dragOrigin.current.startX + dx, MARGIN, window.innerWidth - FAB_SIZE - MARGIN),
            y: clamp(dragOrigin.current.startY + dy, MARGIN, window.innerHeight - FAB_SIZE - MARGIN),
          });
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [position.x, position.y],
  );

  const consumeDragged = useCallback(() => {
    const wasDragged = draggedRef.current;
    draggedRef.current = false;
    return wasDragged;
  }, []);

  return { position, onPointerDown, consumeDragged };
}
