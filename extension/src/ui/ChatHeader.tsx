import type { Contact, MyStatusPreset } from "../lib/types";
import { StatusPicker } from "./StatusPicker";

interface ChatHeaderProps {
  contact: Contact;
  /** Overrides the displayed name and hides the status line — used for the contacts list, which isn't about any one contact. */
  title?: string;
  onBack?: () => void;
  onMinimize: () => void;
  onClose: () => void;
  myStatus: MyStatusPreset;
  onMyStatusChange: (status: MyStatusPreset) => void;
}

export function ChatHeader({ contact, title, onBack, onMinimize, onClose, myStatus, onMyStatusChange }: ChatHeaderProps) {
  return (
    <header className="pco-header">
      <div className="pco-header__identity">
        {onBack && (
          <button type="button" className="pco-header__btn pco-header__back" aria-label="Back to contacts" onClick={onBack}>
            ←
          </button>
        )}
        <div className="pco-header__text">
          <span className="pco-header__name">{title ?? contact.name}</span>
          {!title && (
            <span className={`pco-header__status pco-header__status--${contact.status}`}>
              <span className="pco-header__status-dot" />
              {contact.customStatus?.label ?? (contact.status === "online" ? "Online" : "Offline")}
            </span>
          )}
        </div>
      </div>
      <div className="pco-header__actions">
        <StatusPicker status={myStatus} onChange={onMyStatusChange} />
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
