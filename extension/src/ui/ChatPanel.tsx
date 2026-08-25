import type { RefObject } from "react";
import type { ChatController } from "../lib/chatEventBus";
import type { ChatState, MyStatusPreset } from "../lib/types";
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
  onRevealMessage: (messageId: string) => void;
  onClose: () => void;
  privacyMode: boolean;
  quickReplies: string[];
  view: "list" | "conversation";
  onShowList: () => void;
  contactIds: string[];
  getController: (id: string) => ChatController | undefined;
  activeId: string;
  onSelectContact: (id: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onComposerFocusChange: (focused: boolean) => void;
  myStatus: MyStatusPreset;
  onMyStatusChange: (status: MyStatusPreset) => void;
  emojiTheme: "light" | "dark" | "auto";
  portalRef: RefObject<HTMLDivElement | null>;
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
  onRevealMessage,
  onClose,
  privacyMode,
  quickReplies,
  view,
  onShowList,
  contactIds,
  getController,
  activeId,
  onSelectContact,
  onMouseEnter,
  onMouseLeave,
  onComposerFocusChange,
  myStatus,
  onMyStatusChange,
  emojiTheme,
  portalRef,
}: ChatPanelProps) {
  const { width, isResizing, onHandlePointerDown } = sidebar;
  const showBack = view === "conversation" && contactIds.length > 1;

  return (
    <div
      className={`pco-panel${isOpen ? " pco-panel--open" : ""}${isResizing ? " pco-panel--resizing" : ""}${instant ? " pco-panel--instant" : ""}`}
      style={{ width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-hidden={!isOpen}
    >
      <ResizeHandle onPointerDown={onHandlePointerDown} />
      {view === "list" ? (
        <>
          <ChatHeader
            contact={state.contact}
            title="Contacts"
            onMinimize={onClose}
            onClose={onClose}
            myStatus={myStatus}
            onMyStatusChange={onMyStatusChange}
          />
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
            myStatus={myStatus}
            onMyStatusChange={onMyStatusChange}
          />
          <MessageList
            messages={state.messages}
            privacyMode={privacyMode}
            onRetry={onRetry}
            onRevealMessage={onRevealMessage}
            remoteTyping={state.remoteTyping}
            contactName={state.contact.name}
          />
          <Composer
            draft={state.draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            privacyMode={privacyMode}
            quickReplies={quickReplies}
            onFocusChange={onComposerFocusChange}
            emojiTheme={emojiTheme}
            portalRef={portalRef}
          />
        </>
      )}
    </div>
  );
}
