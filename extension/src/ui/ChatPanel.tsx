import type { RefObject } from "react";
import type { ChatController } from "../lib/chatEventBus";
import type { Contact, ChatState } from "../lib/types";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ResizeHandle } from "./ResizeHandle";
import { ContactList } from "./ContactList";
import type { SidebarWidthApi } from "./hooks/useSidebarWidth";

/** Placeholder passed to the list-view ChatHeader when there's no active contact yet — never
 * actually displayed (the header's `title` prop overrides the name, and the rename affordance is
 * hidden without onRenameContact), just satisfies ChatHeader's required `contact` prop. */
const NO_ACTIVE_CONTACT: Contact = { id: "", name: "", status: "offline", connected: true };

interface ChatPanelProps {
  /** null until at least one contact exists — see workspace.getActiveController(). The panel
   * still renders in that case (see effectiveView below), just forced to the "list" view, which
   * shows ContactList's own empty state instead of a conversation with nothing to show. */
  state: ChatState | null;
  isOpen: boolean;
  instant: boolean;
  sidebar: SidebarWidthApi;
  onSend: (text: string) => void;
  onDraftChange: (text: string) => void;
  onRetry: (messageId: string) => void;
  onRevealMessage: (messageId: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  privacyMode: boolean;
  showStatus: boolean;
  quickReplies: string[];
  view: "list" | "conversation";
  onShowList: () => void;
  contactIds: string[];
  getController: (id: string) => ChatController | undefined;
  activeId: string;
  onSelectContact: (id: string) => void;
  onRemoveContact: (id: string, name: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onComposerFocusChange: (focused: boolean) => void;
  onRenameContact: (name: string) => void;
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
  onRefresh,
  refreshing,
  privacyMode,
  showStatus,
  quickReplies,
  view,
  onShowList,
  contactIds,
  getController,
  activeId,
  onSelectContact,
  onRemoveContact,
  onMouseEnter,
  onMouseLeave,
  onComposerFocusChange,
  onRenameContact,
  emojiTheme,
  portalRef,
}: ChatPanelProps) {
  const { width, isResizing, onHandlePointerDown } = sidebar;
  // No active contact means nothing to converse about — force list view regardless of the
  // last-requested `view` (e.g. a right-click reopen after the only contact was removed).
  const effectiveView = state ? view : "list";
  const showBack = effectiveView === "conversation" && contactIds.length > 1;

  return (
    <div
      className={`pco-panel${isOpen ? " pco-panel--open" : ""}${isResizing ? " pco-panel--resizing" : ""}${instant ? " pco-panel--instant" : ""}`}
      style={{ width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-hidden={!isOpen}
    >
      <ResizeHandle onPointerDown={onHandlePointerDown} />
      {effectiveView === "list" || !state ? (
        <>
          <ChatHeader
            contact={state?.contact ?? NO_ACTIVE_CONTACT}
            title="Contacts"
            showStatus={showStatus}
            onMinimize={onClose}
            onClose={onClose}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
          <ContactList
            contactIds={contactIds}
            getController={getController}
            activeId={activeId}
            privacyMode={privacyMode}
            showStatus={showStatus}
            onSelect={onSelectContact}
            onRemove={onRemoveContact}
          />
        </>
      ) : (
        <>
          <ChatHeader
            contact={state.contact}
            showStatus={showStatus}
            onBack={showBack ? onShowList : undefined}
            onMinimize={onClose}
            onClose={onClose}
            onRefresh={onRefresh}
            refreshing={refreshing}
            onRenameContact={onRenameContact}
          />
          {state.contact.connected ? (
            <>
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
          ) : (
            // They disconnected you — no conversation to open, just say so. Removing them from
            // your own list (via the back button -> the row's × in ContactList) is still your call.
            <div className="pco-disconnected-notice">{state.contact.name} disconnected</div>
          )}
        </>
      )}
    </div>
  );
}
