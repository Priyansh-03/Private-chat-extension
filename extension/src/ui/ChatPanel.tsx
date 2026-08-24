import type { ChatController } from "../lib/chatEventBus";
import type { ChatState } from "../lib/types";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ResizeHandle } from "./ResizeHandle";
import { ContactList } from "./ContactList";
import type { SidebarWidthApi } from "./hooks/useSidebarWidth";

interface ChatPanelProps {
  state: ChatState;
  isOpen: boolean;
  instant: boolean;
  sidebar: SidebarWidthApi;
  onSend: (text: string) => void;
  onDraftChange: (text: string) => void;
  onRetry: (messageId: string) => void;
  onClose: () => void;
  privacyMode: boolean;
  quickReplies: string[];
  view: "list" | "conversation";
  onShowList: () => void;
  contactIds: string[];
  getController: (id: string) => ChatController | undefined;
  activeId: string;
  onSelectContact: (id: string) => void;
}

/** Right-edge-docked sidebar — pinned position, not tied to the FAB. */
export function ChatPanel({
  state,
  isOpen,
  instant,
  sidebar,
  onSend,
  onDraftChange,
  onRetry,
  onClose,
  privacyMode,
  quickReplies,
  view,
  onShowList,
  contactIds,
  getController,
  activeId,
  onSelectContact,
}: ChatPanelProps) {
  const { width, isResizing, onHandlePointerDown } = sidebar;
  const showBack = view === "conversation" && contactIds.length > 1;

  return (
    <div
      className={`pco-panel${isOpen ? " pco-panel--open" : ""}${isResizing ? " pco-panel--resizing" : ""}${instant ? " pco-panel--instant" : ""}`}
      style={{ width }}
      aria-hidden={!isOpen}
    >
      <ResizeHandle onPointerDown={onHandlePointerDown} />
      {view === "list" ? (
        <>
          <ChatHeader contact={state.contact} onMinimize={onClose} onClose={onClose} />
          <ContactList
            contactIds={contactIds}
            getController={getController}
            activeId={activeId}
            privacyMode={privacyMode}
            onSelect={onSelectContact}
          />
        </>
      ) : (
        <>
          <ChatHeader
            contact={state.contact}
            onBack={showBack ? onShowList : undefined}
            onMinimize={onClose}
            onClose={onClose}
          />
          <MessageList
            messages={state.messages}
            privacyMode={privacyMode}
            onRetry={onRetry}
            remoteTyping={state.remoteTyping}
            contactName={state.contact.name}
          />
          <Composer
            draft={state.draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            privacyMode={privacyMode}
            quickReplies={quickReplies}
          />
        </>
      )}
    </div>
  );
}
