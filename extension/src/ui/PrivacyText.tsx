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
}

/**
 * Both the mask and the real text are always in the DOM; CSS :hover swaps
 * which one is visible. This — rather than onMouseEnter/onMouseLeave plus a
 * React state swap — is what keeps reveal state from getting stuck: :hover
 * is re-evaluated by the browser against the live cursor position every
 * frame, so it can't miss a "mouse left" transition the way a discrete
 * event can when the swap itself changes the hovered element's layout.
 */
export function PrivacyText({ text, enabled }: PrivacyTextProps) {
  if (!enabled) return <>{text}</>;

  return (
    <span className="pco-privacy-text">
      <span className="pco-privacy-text__mask">
        <MaskedWords text={text} />
      </span>
      <span className="pco-privacy-text__real">{text}</span>
    </span>
  );
}
