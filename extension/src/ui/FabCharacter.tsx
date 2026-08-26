import { FAB_SIZE } from "../lib/constants";
import type { FabCharacterPhase, PlayfulKind } from "./hooks/useFabCharacter";

interface FabCharacterProps {
  position: { x: number; y: number };
  phase: FabCharacterPhase;
  playfulKind: PlayfulKind | null;
  animationKey: number;
  layer: "back" | "front";
}

function characterClassName(phase: FabCharacterPhase, playfulKind: PlayfulKind | null): string {
  return ["pco-character", `pco-character--${phase}`, playfulKind ? `pco-character--${playfulKind}` : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Purely decorative, pointer-events: none — never intercepts drag/click on the FAB beneath it.
 * Rendered as two layers straddling the FAB in the DOM: "back" (head/eyes/mouth/body) is painted
 * before the FAB so the FAB's opaque circle naturally occludes the lower half of the head while
 * hidden; "front" (hands) is painted after the FAB so they appear to grip its rim once emerged.
 */
export function FabCharacter({ position, phase, playfulKind, animationKey, layer }: FabCharacterProps) {
  const className = characterClassName(phase, playfulKind);
  const style = { left: position.x + FAB_SIZE / 2, top: position.y };

  if (layer === "back") {
    return (
      <div key={animationKey} className={className} style={style} aria-hidden="true">
        <span className="pco-character__body" />
        <span className="pco-character__head">
          <span className="pco-character__eye pco-character__eye--l">
            <span className="pco-character__pupil" />
          </span>
          <span className="pco-character__eye pco-character__eye--r">
            <span className="pco-character__pupil" />
          </span>
          <span className="pco-character__mouth" />
        </span>
      </div>
    );
  }

  return (
    <div key={animationKey} className={className} style={style} aria-hidden="true">
      <span className="pco-character__hand pco-character__hand--l" />
      <span className="pco-character__hand pco-character__hand--r" />
    </div>
  );
}
