import { useCallback, useEffect, useRef, useState } from "react";

export type FabCharacterVariant = "idle-peek" | "message-peek" | "hover-peek";
type FabCharacterState = "idle" | "animating" | "cooldown";

const IDLE_MIN_MS = 15000;
const IDLE_MAX_MS = 30000;
const PEEK_MS = 1600;
const HOVER_PEEK_MS = 800;
const COOLDOWN_MS = 1500;
const REDUCED_MESSAGE_MS = 500;

function getReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface FabCharacterApi {
  variant: FabCharacterVariant | null;
  animationKey: number;
  triggerMessage: () => void;
  triggerHover: () => void;
}

/** idle -> animating -> cooldown -> idle. A new message always interrupts; hover only starts from idle. */
export function useFabCharacter(armIdleTimer: boolean): FabCharacterApi {
  const [variant, setVariant] = useState<FabCharacterVariant | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(getReducedMotion);
  const stateRef = useRef<FabCharacterState>("idle");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const play = useCallback(
    (next: FabCharacterVariant, durationMs: number) => {
      clearTimers();
      stateRef.current = "animating";
      setVariant(next);
      setAnimationKey((key) => key + 1);
      const hideTimer = setTimeout(() => {
        setVariant(null);
        stateRef.current = "cooldown";
        const settleTimer = setTimeout(() => {
          stateRef.current = "idle";
        }, COOLDOWN_MS);
        timersRef.current.push(settleTimer);
      }, durationMs);
      timersRef.current.push(hideTimer);
    },
    [clearTimers],
  );

  const triggerMessage = useCallback(() => {
    play("message-peek", reducedMotion ? REDUCED_MESSAGE_MS : PEEK_MS);
  }, [play, reducedMotion]);

  const triggerHover = useCallback(() => {
    if (reducedMotion || stateRef.current !== "idle") return;
    play("hover-peek", HOVER_PEEK_MS);
  }, [play, reducedMotion]);

  useEffect(() => {
    if (!armIdleTimer || reducedMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
      timer = setTimeout(() => {
        if (document.visibilityState === "visible" && stateRef.current === "idle") play("idle-peek", PEEK_MS);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [armIdleTimer, reducedMotion, play]);

  return { variant, animationKey, triggerMessage, triggerHover };
}
