interface MessageOverflowLayerProps {
  text: string;
  maxChars: number;
}

/** Mirrors the input's text, coloring anything past maxChars red — pure presentational, no state. */
export function MessageOverflowLayer({ text, maxChars }: MessageOverflowLayerProps) {
  return (
    <>
      <span>{text.slice(0, maxChars)}</span>
      <span className="pco-input-overlay__over">{text.slice(maxChars)}</span>
    </>
  );
}
