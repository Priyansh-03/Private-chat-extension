import { useState } from "react";
import { MAX_QUICK_REPLIES, QUICK_REPLY_MAX_CHARS } from "../lib/limits";

interface QuickReplyEditorProps {
  replies: string[];
  onChange: (replies: string[]) => void;
}

export function QuickReplyEditor({ replies, onChange }: QuickReplyEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= replies.length) return;
    const next = replies.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const update = (index: number, text: string) => {
    const next = replies.slice();
    next[index] = text.slice(0, QUICK_REPLY_MAX_CHARS);
    onChange(next);
  };

  const remove = (index: number) => onChange(replies.filter((_, i) => i !== index));

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || replies.length >= MAX_QUICK_REPLIES) return;
    onChange([...replies, trimmed]);
    setDraft("");
  };

  const atLimit = replies.length >= MAX_QUICK_REPLIES;

  return (
    <div className="pcp-row pcp-row--stack">
      <div className="pcp-row__top">
        <span>Quick Replies</span>
        <button type="button" className="pcp-btn" onClick={() => setOpen((prev) => !prev)}>
          {open ? "Done" : "Manage"}
        </button>
      </div>
      {open && (
        <div className="pcp-editor">
          {replies.map((reply, index) => (
            <div key={index} className="pcp-editor__item">
              <input
                value={reply}
                maxLength={QUICK_REPLY_MAX_CHARS}
                onChange={(event) => update(index, event.target.value)}
                className="pcp-editor__input"
              />
              <span className="pcp-counter">
                {reply.length}/{QUICK_REPLY_MAX_CHARS}
              </span>
              <button type="button" className="pcp-icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                ↑
              </button>
              <button
                type="button"
                className="pcp-icon"
                onClick={() => move(index, 1)}
                disabled={index === replies.length - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button type="button" className="pcp-icon" onClick={() => remove(index)} aria-label="Remove">
                ×
              </button>
            </div>
          ))}
          {atLimit ? (
            <p className="pcp-hint">Maximum {MAX_QUICK_REPLIES} quick replies.</p>
          ) : (
            <div className="pcp-editor__item">
              <input
                value={draft}
                maxLength={QUICK_REPLY_MAX_CHARS}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="New quick reply"
                className="pcp-editor__input"
                onKeyDown={(event) => {
                  if (event.key === "Enter") add();
                }}
              />
              <span className="pcp-counter">
                {draft.length}/{QUICK_REPLY_MAX_CHARS}
              </span>
              <button type="button" className="pcp-btn" onClick={add}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
