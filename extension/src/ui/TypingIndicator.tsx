export function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="pco-typing">
      <span className="pco-typing__dots">
        <span className="pco-typing__dot" />
        <span className="pco-typing__dot" />
        <span className="pco-typing__dot" />
      </span>
      <span className="pco-typing__label">{name} is typing…</span>
    </div>
  );
}
