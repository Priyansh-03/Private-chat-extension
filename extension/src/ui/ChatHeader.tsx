import { useEffect, useRef, useState } from "react";
import type { Contact } from "../lib/types";

interface ChatHeaderProps {
  contact: Contact;
  /** Overrides the displayed name and hides the status line — used for the contacts list, which isn't about any one contact. */
  title?: string;
  showStatus: boolean;
  onBack?: () => void;
  onMinimize: () => void;
  onClose: () => void;
  /** Omitted (e.g. for the "Contacts" list header) to hide the rename affordance entirely. */
  onRenameContact?: (name: string) => void;
}

export function ChatHeader({
  contact,
  title,
  showStatus,
  onBack,
  onMinimize,
  onClose,
  onRenameContact,
}: ChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(contact.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // The active contact can change while a rename is in progress (e.g. via keyboard); always
  // start editing from the current name rather than a stale one.
  const startEditing = () => {
    setDraftName(contact.name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== contact.name) onRenameContact?.(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraftName(contact.name);
    setEditing(false);
  };

  return (
    <header className="pco-header">
      <div className="pco-header__identity">
        {onBack && (
          <button type="button" className="pco-header__btn pco-header__back" aria-label="Back to contacts" onClick={onBack}>
            ←
          </button>
        )}
        <div className="pco-header__text">
          <div className="pco-header__name-row">
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                className="pco-header__name-input"
                value={draftName}
                maxLength={40}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit();
                  if (event.key === "Escape") cancel();
                }}
              />
            ) : (
              <>
                <span className="pco-header__name">{title ?? contact.name}</span>
                {!title && onRenameContact && (
                  <button
                    type="button"
                    className="pco-header__btn pco-header__edit"
                    aria-label="Rename contact"
                    onClick={startEditing}
                  >
                    ✎
                  </button>
                )}
              </>
            )}
          </div>
          {!title && showStatus && !editing && (
            <span
              className={`pco-header__status pco-header__status--${contact.connected ? contact.status : "disconnected"}`}
            >
              <span className="pco-header__status-dot" />
              {contact.connected ? (contact.status === "online" ? "Online" : "Offline") : "Disconnected"}
            </span>
          )}
        </div>
      </div>
      <div className="pco-header__actions">
        <button type="button" className="pco-header__btn" aria-label="Minimize" onClick={onMinimize}>
          −
        </button>
        <button type="button" className="pco-header__btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
    </header>
  );
}
