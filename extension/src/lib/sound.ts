import type { NotificationSound } from "./types";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!audioContext) audioContext = new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Call on the first user gesture within the widget (e.g. the FAB's pointerdown) so the browser's
 * autoplay policy is already satisfied by the time an incoming-message sound needs to play —
 * otherwise a chime scheduled before any interaction on the page is silently dropped.
 */
export function primeAudio(): void {
  const ctx = getContext();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

function tone(ctx: AudioContext, now: number, frequency: number, startAt: number, durationS: number, peakGain: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now + startAt);
  gain.gain.setValueAtTime(0.0001, now + startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + startAt + durationS);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now + startAt);
  oscillator.stop(now + startAt + durationS + 0.02);
}

function schedule(ctx: AudioContext, kind: NotificationSound): void {
  const now = ctx.currentTime;
  switch (kind) {
    case "chime":
      tone(ctx, now, 880, 0, 0.22, 0.06);
      break;
    case "pop":
      tone(ctx, now, 320, 0, 0.12, 0.09);
      break;
    case "ding":
      tone(ctx, now, 1320, 0, 0.35, 0.045);
      tone(ctx, now, 1980, 0.03, 0.3, 0.02);
      break;
    case "tick":
      // Short and quiet on purpose — this plays for a message landing in the conversation
      // you're already looking at, so it should confirm without interrupting.
      tone(ctx, now, 700, 0, 0.08, 0.035);
      break;
  }
}

/** Synthesized notification tones — no bundled audio asset needed. */
export function playNotificationSound(kind: NotificationSound): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // No user gesture on this page yet; try to resume for next time, but skip this one rather
    // than schedule audio against a context that may never actually start.
    void ctx.resume().catch(() => {});
    return;
  }
  schedule(ctx, kind);
}
