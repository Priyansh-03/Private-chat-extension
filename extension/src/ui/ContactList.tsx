import type { ChatController } from "../lib/chatEventBus";
import { PrivacyText } from "./PrivacyText";

interface ContactListProps {
  contactIds: string[];
  getController: (id: string) => ChatController | undefined;
  activeId: string;
  privacyMode: boolean;
  onSelect: (id: string) => void;
}

export function ContactList({ contactIds, getController, activeId, privacyMode, onSelect }: ContactListProps) {
  return (
    <div className="pco-contact-list">
      <div className="pco-contact-list__title">Messages</div>
      {contactIds.map((id) => {
        const controller = getController(id);
        if (!controller) return null;
        const state = controller.getState();
        return (
          <button
            key={id}
            type="button"
            className={`pco-contact-row${id === activeId ? " pco-contact-row--active" : ""}`}
            onClick={() => onSelect(id)}
          >
            <span className={`pco-contact-row__dot pco-contact-row__dot--${state.contact.status}`} />
            <span className="pco-contact-row__name">
              <PrivacyText text={state.contact.name} enabled={privacyMode} />
            </span>
            {state.unreadCount > 0 && <span className="pco-contact-row__badge">{state.unreadCount}</span>}
          </button>
        );
      })}
    </div>
  );
}
