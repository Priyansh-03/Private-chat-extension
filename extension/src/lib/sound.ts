let audioContext: AudioContext | null = null;

/** Tiny synthesized chime — no bundled audio asset needed. */
export function playIncomingChime(): void {
  try {
    if (!audioContext) audioContext = new AudioContext();
    const ctx = audioContext;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  } catch {
    // e.g. blocked before any user gesture on the page; safe to skip
  }
}
