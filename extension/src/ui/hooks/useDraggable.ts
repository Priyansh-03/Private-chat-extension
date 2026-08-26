import { useCallback, useEffect, useRef, useState } from "react";
import { FAB_DRAG_THRESHOLD, FAB_MARGIN, FAB_SIZE } from "../../lib/constants";
import { clamp } from "../../lib/geometry";
import { loadFabPosition, saveFabPosition } from "../../lib/settingsStore";

interface Position {
  x: number;
  y: number;
}

function defaultPosition(): Position {
  return {
    x: window.innerWidth - FAB_SIZE - FAB_MARGIN,
    y: window.innerHeight - FAB_SIZE - FAB_MARGIN - 60,
  };
}

export interface DraggableApi {
  position: Position;
  isDragging: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  consumeDragged: () => boolean;
}

/** Free-drag positioning for the FAB, persisted across pages/sessions via chrome.storage.local. */
export function useDraggable(): DraggableApi {
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef({ pointerX: 0, pointerY: 0, startX: 0, startY: 0 });
  const draggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadFabPosition().then((saved) => {
      if (!cancelled && saved) {
        setPosition({
          x: clamp(saved.x, FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
          y: clamp(saved.y, FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
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
        x: clamp(prev.x, FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
        y: clamp(prev.y, FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
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
      setIsDragging(true);
      dragOrigin.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: position.x,
        startY: position.y,
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - dragOrigin.current.pointerX;
        const dy = moveEvent.clientY - dragOrigin.current.pointerY;
        if (Math.abs(dx) > FAB_DRAG_THRESHOLD || Math.abs(dy) > FAB_DRAG_THRESHOLD) {
          draggedRef.current = true;
        }
        setPosition({
          x: clamp(dragOrigin.current.startX + dx, FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
          y: clamp(dragOrigin.current.startY + dy, FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setIsDragging(false);
        if (draggedRef.current) {
          const dx = upEvent.clientX - dragOrigin.current.pointerX;
          const dy = upEvent.clientY - dragOrigin.current.pointerY;
          void saveFabPosition({
            x: clamp(dragOrigin.current.startX + dx, FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
            y: clamp(dragOrigin.current.startY + dy, FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
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

  return { position, isDragging, onPointerDown, consumeDragged };
}
