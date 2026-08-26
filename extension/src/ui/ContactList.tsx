import type { ChatController } from "../lib/chatEventBus";
import { PrivacyText } from "./PrivacyText";

interface ContactListProps {
  contactIds: string[];
  getController: (id: string) => ChatController | undefined;
  activeId: string;
  privacyMode: boolean;
  showStatus: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string, name: string) => void;
}

export function ContactList({ contactIds, getController, activeId, privacyMode, showStatus, onSelect, onRemove }: ContactListProps) {
  return (
    <div className="pco-contact-list">
      <div className="pco-contact-list__title">Messages</div>
      {contactIds.length === 0 && (
        <div className="pco-contact-list__empty">
          No contacts yet.
          <br />
          Click the extension&apos;s toolbar icon and use <strong>Manage</strong> to create or accept an invite.
        </div>
      )}
      {contactIds.map((id) => {
        const controller = getController(id);
        if (!controller) return null;
        const state = controller.getState();
        return (
          // A div, not a button — it now contains two separate buttons (select, remove), and
          // buttons can't nest inside a button per HTML semantics / React's DOM warnings.
          <div key={id} className={`pco-contact-row${id === activeId ? " pco-contact-row--active" : ""}`}>
            <button type="button" className="pco-contact-row__select" onClick={() => onSelect(id)}>
              {showStatus && (
                <span
                  className={`pco-contact-row__dot pco-contact-row__dot--${state.contact.connected ? state.contact.status : "disconnected"}`}
                />
              )}
              <span className="pco-contact-row__name">
                <PrivacyText text={state.contact.name} enabled={privacyMode} />
              </span>
              {!state.contact.connected && <span className="pco-contact-row__disconnected">Disconnected</span>}
              {state.unreadCount > 0 && <span className="pco-contact-row__badge">{state.unreadCount}</span>}
            </button>
            <button
              type="button"
              className="pco-header__btn pco-contact-row__remove"
              aria-label={`Disconnect ${state.contact.name}`}
              title="Disconnect"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(id, state.contact.name);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
