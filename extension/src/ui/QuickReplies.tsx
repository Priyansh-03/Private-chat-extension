interface QuickRepliesProps {
  replies: string[];
  onSelect: (text: string) => void;
}

export function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
  if (replies.length === 0) return null;
  return (
    <div className="pco-quick-replies">
      {replies.map((reply) => (
        <button key={reply} type="button" className="pco-quick-reply" title={reply} onClick={() => onSelect(reply)}>
          {reply}
        </button>
      ))}
    </div>
  );
}
