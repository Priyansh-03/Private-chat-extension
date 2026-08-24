function MaskedWords({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((chunk, index) =>
        /^\s*$/.test(chunk) ? (
          <span key={index}>{chunk || " "}</span>
        ) : (
          <span key={index} className="pco-mask-block" style={{ width: `${Math.max(1, chunk.length) * 0.55}em` }} />
        ),
      )}
    </>
  );
}

interface PrivacyTextProps {
  text: string;
  enabled: boolean;
  /** One-way "mark seen" latch, fired on hover. Not used for the visual mask/reveal swap (that's pure CSS :hover). */
  onReveal?: () => void;
}

/** Mask and real text both stay in the DOM; CSS :hover swaps which is visible — avoids a JS-state hover bug fixed earlier. */
export function PrivacyText({ text, enabled, onReveal }: PrivacyTextProps) {
  if (!enabled) return <span onMouseEnter={onReveal}>{text}</span>;

  return (
    <span className="pco-privacy-text" onMouseEnter={onReveal}>
      <span className="pco-privacy-text__mask">
        <MaskedWords text={text} />
      </span>
      <span className="pco-privacy-text__real">{text}</span>
    </span>
  );
}
