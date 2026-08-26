import { forwardRef } from "react";
import { FAB_SIZE } from "../lib/constants";
import type { ConnectionStatus } from "../lib/types";

interface FabProps {
  isOpen: boolean;
  connectionStatus: Exclude<ConnectionStatus, "off">;
  unreadCount: number;
  pulseKey: number;
  quietMode: boolean;
  position: { x: number; y: number };
  onPointerDown: (event: React.PointerEvent) => void;
  onLeftClick: () => void;
  onRightClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  {
    isOpen,
    connectionStatus,
    unreadCount,
    pulseKey,
    quietMode,
    position,
    onPointerDown,
    onLeftClick,
    onRightClick,
    onMouseEnter,
    onMouseLeave,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`pco-fab pco-fab--${connectionStatus}${isOpen ? " pco-fab--open" : ""}${
        unreadCount > 0 && !isOpen && !quietMode ? " pco-fab--glow" : ""
      }`}
      style={{ left: position.x, top: position.y, width: FAB_SIZE, height: FAB_SIZE }}
      onPointerDown={onPointerDown}
      onClick={onLeftClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={(event) => {
        event.preventDefault();
        onRightClick();
      }}
      aria-label={isOpen ? "Close private chat" : "Left click to peek, right click for full chat"}
      aria-expanded={isOpen}
    >
      {connectionStatus === "problem" ? (
        <span className="pco-fab__glyph pco-fab__glyph--problem">!</span>
      ) : (
        <span className="pco-fab__glyph" />
      )}
      {pulseKey > 0 && !isOpen && !quietMode && <span key={pulseKey} className="pco-fab__pulse" />}
      {unreadCount > 0 && !isOpen && (
        <span className="pco-fab__badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
      )}
    </button>
  );
});
