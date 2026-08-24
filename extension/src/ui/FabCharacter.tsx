import { FAB_SIZE } from "./hooks/useDraggable";
import type { FabCharacterVariant } from "./hooks/useFabCharacter";

interface FabCharacterProps {
  position: { x: number; y: number };
  variant: FabCharacterVariant | null;
  animationKey: number;
}

/** Purely decorative, pointer-events: none — never intercepts drag/click on the FAB beneath it. */
export function FabCharacter({ position, variant, animationKey }: FabCharacterProps) {
  if (!variant) return null;
  return (
    <div
      key={animationKey}
      className={`pco-character pco-character--${variant}`}
      style={{ left: position.x + FAB_SIZE / 2, top: position.y }}
      aria-hidden="true"
    >
      <span className="pco-character__shape" />
    </div>
  );
}
