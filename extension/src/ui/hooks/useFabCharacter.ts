import { useCallback, useEffect, useRef, useState } from "react";

export type FabCharacterPhase = "hidden" | "emerging" | "playful" | "hiding";
export type PlayfulKind = "idle" | "wave";

const IDLE_MIN_MS = 15000;
const IDLE_MAX_MS = 30000;
const EMERGE_MS = 550;
const PLAYFUL_IDLE_MS = 1000;
const PLAYFUL_MESSAGE_MS = 4500;
const HIDE_MS = 500;

function getReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface FabCharacterApi {
  phase: FabCharacterPhase;
  playfulKind: PlayfulKind | null;
  animationKey: number;
  triggerMessage: () => void;
  triggerHover: () => void;
}

/**
 * hidden -> emerging -> playful -> hiding -> hidden. A new message always interrupts the current
 * cycle and plays an extended wave (kept up alongside the "new message" thought bubble); hover
 * plays the same brief cycle as idle, but only while fully hidden, so repeated hovering while
 * already up doesn't restart the animation.
 */
export function useFabCharacter(armIdleTimer: boolean): FabCharacterApi {
  const [phase, setPhase] = useState<FabCharacterPhase>("hidden");
  const [playfulKind, setPlayfulKind] = useState<PlayfulKind | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(getReducedMotion);

  const phaseRef = useRef<FabCharacterPhase>("hidden");
  const cycleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearCycleTimers = useCallback(() => {
    cycleTimersRef.current.forEach(clearTimeout);
    cycleTimersRef.current = [];
  }, []);

  const runCycle = useCallback(
    (kind: PlayfulKind) => {
      clearCycleTimers();
      phaseRef.current = "emerging";
      setPhase("emerging");
      setPlayfulKind(kind);
      setAnimationKey((key) => key + 1);

      const toPlayful = setTimeout(() => {
        phaseRef.current = "playful";
        setPhase("playful");

        const toHiding = setTimeout(
          () => {
            phaseRef.current = "hiding";
            setPhase("hiding");

            const toHidden = setTimeout(() => {
              phaseRef.current = "hidden";
              setPhase("hidden");
              setPlayfulKind(null);
            }, HIDE_MS);
            cycleTimersRef.current.push(toHidden);
          },
          kind === "wave" ? PLAYFUL_MESSAGE_MS : PLAYFUL_IDLE_MS,
        );
        cycleTimersRef.current.push(toHiding);
      }, EMERGE_MS);
      cycleTimersRef.current.push(toPlayful);
    },
    [clearCycleTimers],
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Reduced motion always wins: snap back to a static hidden pose and drop any in-flight cycle.
  useEffect(() => {
    if (!reducedMotion) return;
    clearCycleTimers();
    phaseRef.current = "hidden";
    setPhase("hidden");
    setPlayfulKind(null);
  }, [reducedMotion, clearCycleTimers]);

  useEffect(() => clearCycleTimers, [clearCycleTimers]);

  const triggerMessage = useCallback(() => {
    if (reducedMotion) return;
    runCycle("wave");
  }, [reducedMotion, runCycle]);

  const triggerHover = useCallback(() => {
    if (reducedMotion || phaseRef.current !== "hidden") return;
    runCycle("idle");
  }, [reducedMotion, runCycle]);

  useEffect(() => {
    if (!armIdleTimer || reducedMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
      timer = setTimeout(() => {
        if (document.visibilityState === "visible" && phaseRef.current === "hidden") runCycle("idle");
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [armIdleTimer, reducedMotion, runCycle]);

  return { phase, playfulKind, animationKey, triggerMessage, triggerHover };
}
