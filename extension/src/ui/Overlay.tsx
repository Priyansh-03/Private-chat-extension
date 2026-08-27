import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { USE_REAL_BACKEND } from "../lib/backendConfig";
import { MESSAGE_NOTICE_DURATION_MS, PANEL_AUTO_CLOSE_MS } from "../lib/constants";
import { createDemoSeeds } from "../lib/devSeed";
import { playNotificationSound, primeAudio } from "../lib/sound";
import type { ChatWorkspace as ChatWorkspaceType } from "../lib/workspace";
import { ChatWorkspace } from "../lib/workspace";
import type {
  InboundFromBackground,
  OutboundToBackground,
  RemoteContactSnapshot,
  RemoveContactResponse,
  RenameContactResponse,
} from "../lib/transportProtocol";
import { defaultContactName, type ChatMessage, type ConnectionStatus, type DisclosureMode } from "../lib/types";
import { Fab } from "./Fab";
import { FabCharacter } from "./FabCharacter";
import { FabCallout, CALLOUT_SIZE } from "./FabCallout";
import { PeekPanel, PEEK_SIZE } from "./PeekPanel";
import { ChatPanel } from "./ChatPanel";
import { useChatDisclosure } from "./hooks/useChatDisclosure";
import { useDraggable } from "./hooks/useDraggable";
import { usePanelAnchor } from "./hooks/usePanelAnchor";
import { useSidebarWidth } from "./hooks/useSidebarWidth";
import { useFabCharacter } from "./hooks/useFabCharacter";
import { useSettings } from "./hooks/useSettings";

function requestInitialStatus(): Promise<ConnectionStatus> {
  return new Promise((resolve) => {
    const request: OutboundToBackground = { type: "chat:request-status" };
    chrome.runtime.sendMessage(request, (response: InboundFromBackground | undefined) => {
      void chrome.runtime.lastError;
      resolve(response?.type === "connection:status" ? response.status : "connecting");
    });
  });
}

export function Overlay() {
  const { settings, refresh: refreshSettings } = useSettings();
  const workspaceRef = useRef<ChatWorkspaceType>();
  if (!workspaceRef.current) workspaceRef.current = new ChatWorkspace(USE_REAL_BACKEND ? [] : createDemoSeeds());
  const workspace = workspaceRef.current;

  // Real contacts arrive asynchronously: an initial fetch here (contacts + each one's full
  // decrypted history from the server, see backendTransport.ts's getMessageHistory), then live
  // contact:added events via the existing workspace.route() call below (both the inviter and the
  // acceptor side of a pairing get one). Demo mode already has its seeds at construction.
  // Silent: these are pre-existing contacts this tab is just learning about, not new pairings —
  // otherwise the "New contact added" callout would replay for all of them on every page load.
  // Fetching history here (rather than relying solely on live broadcasts) is what makes any tab —
  // not just the one that happened to be open when a message arrived — converge on the same
  // conversation: the server is now the single source of truth every tab hydrates from.
  useEffect(() => {
    if (!USE_REAL_BACKEND) return;
    let cancelled = false;
    const request: OutboundToBackground = { type: "contacts:request-list" };
    chrome.runtime.sendMessage(request).then(async (contacts: RemoteContactSnapshot[] | undefined) => {
      if (cancelled || !contacts) return;
      await Promise.all(
        contacts.map(async (contact) => {
          const historyRequest: OutboundToBackground = { type: "chat:request-history", contactId: contact.contactId };
          const messages: ChatMessage[] = (await chrome.runtime.sendMessage(historyRequest)) ?? [];
          if (cancelled) return;
          workspace.addContact(
            {
              contact: {
                id: contact.contactId,
                name: contact.name || defaultContactName(contact.contactId),
                status: contact.status,
                connected: contact.connected,
              },
              messages,
            },
            { silent: true },
          );
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const rootRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const disclosure = useChatDisclosure(rootRef);
  const draggable = useDraggable();
  const sidebar = useSidebarWidth();
  const character = useFabCharacter(disclosure.mode === "hidden");
  const [view, setView] = useState<"list" | "conversation">("conversation");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [pulseKey, setPulseKey] = useState(0);
  const [calloutVisible, setCalloutVisible] = useState(false);
  const [calloutText, setCalloutText] = useState("You have a new message");
  const calloutTimer = useRef<ReturnType<typeof setTimeout>>();
  const [hoverCount, setHoverCount] = useState(0);
  const [composerFocused, setComposerFocused] = useState(false);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const handleZoneEnter = () => setHoverCount((count) => count + 1);
  const handleZoneLeave = () => setHoverCount((count) => Math.max(0, count - 1));
  const handleFabEnter = () => {
    handleZoneEnter();
    character.triggerHover();
  };

  // Auto-close after 8s with no hover on the FAB or an open panel, unless
  // actively dragging the FAB or typing (neither of those is "walked away").
  useEffect(() => {
    if (disclosure.mode === "hidden") return;
    if (hoverCount > 0 || draggable.isDragging || composerFocused) return;
    const timer = setTimeout(() => disclosure.close(), PANEL_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [disclosure.mode, hoverCount, draggable.isDragging, composerFocused, disclosure.close]);

  // Peek is a compact card anchored next to the FAB; Full Chat is a pinned
  // right-edge sidebar (overlay.css) and doesn't use this anchor at all.
  const anchor = usePanelAnchor(disclosure.mode === "peek", fabRef, PEEK_SIZE);
  const calloutAnchor = usePanelAnchor(calloutVisible, fabRef, CALLOUT_SIZE);

  // Re-read settings the instant a panel opens, as a defensive re-sync.
  useEffect(() => {
    if (disclosure.mode !== "hidden") refreshSettings();
  }, [disclosure.mode, refreshSettings]);

  const modeRef = useRef<DisclosureMode>(disclosure.mode);
  modeRef.current = disclosure.mode;

  // Re-render whenever any conversation's state changes.
  useEffect(() => workspace.onAnyChange(forceRender), [workspace]);

  // New-message pulse + callout + sound, suppressed by Quiet Mode. A conversation already open
  // skips the pulse/mascot/callout (nothing to draw attention to) but still gets its own quieter
  // sound, distinct from the "come look at this" notification sound used everywhere else.
  useEffect(
    () =>
      workspace.onIncoming((contactId) => {
        if (settings.quietMode) return;
        const conversationVisible = modeRef.current !== "hidden" && workspace.getActiveId() === contactId;

        if (conversationVisible) {
          if (settings.activeChatSound) playNotificationSound(settings.activeChatSoundKind);
          return;
        }

        setPulseKey((key) => key + 1);
        character.triggerMessage();
        if (settings.sound) playNotificationSound(settings.notificationSound);
        setCalloutText("You have a new message");
        setCalloutVisible(true);
        if (calloutTimer.current) clearTimeout(calloutTimer.current);
        calloutTimer.current = setTimeout(() => setCalloutVisible(false), MESSAGE_NOTICE_DURATION_MS);
      }),
    [
      workspace,
      settings.sound,
      settings.notificationSound,
      settings.activeChatSound,
      settings.activeChatSoundKind,
      settings.quietMode,
      character.triggerMessage,
    ],
  );

  // Same pulse/mascot/callout/sound treatment as a new message, for a newly paired contact —
  // no name in the callout, matching the existing "never the sender or message text" policy.
  useEffect(
    () =>
      workspace.onContactAdded(() => {
        if (settings.quietMode) return;
        setPulseKey((key) => key + 1);
        character.triggerMessage();
        if (settings.sound) playNotificationSound(settings.notificationSound);
        setCalloutText("New contact added");
        setCalloutVisible(true);
        if (calloutTimer.current) clearTimeout(calloutTimer.current);
        calloutTimer.current = setTimeout(() => setCalloutVisible(false), MESSAGE_NOTICE_DURATION_MS);
      }),
    [workspace, settings.sound, settings.notificationSound, settings.quietMode, character.triggerMessage],
  );

  // Any panel opening dismisses the callout.
  useEffect(() => {
    if (disclosure.mode !== "hidden") {
      setCalloutVisible(false);
      if (calloutTimer.current) clearTimeout(calloutTimer.current);
    }
  }, [disclosure.mode]);

  // Background connection: initial status + live event stream.
  useEffect(() => {
    if (!settings.extensionEnabled) {
      setConnectionStatus("off");
      return;
    }
    let cancelled = false;
    requestInitialStatus().then((status) => {
      if (!cancelled) setConnectionStatus(status);
    });

    const onMessage = (message: InboundFromBackground) => {
      if (message.type === "connection:status") {
        setConnectionStatus(message.status);
        return;
      }
      workspace.route(message);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [workspace, settings.extensionEnabled]);

  useEffect(() => {
    if (!settings.extensionEnabled) disclosure.closeInstant();
  }, [settings.extensionEnabled]);

  const handleSend = useMemo(() => (text: string) => workspace.getActiveController()?.sendMessage(text), [workspace]);
  const handleDraftChange = useMemo(
    () => (text: string) => workspace.getActiveController()?.setDraft(text),
    [workspace],
  );
  const handleRetry = useMemo(
    () => (messageId: string) => workspace.getActiveController()?.retryMessage(messageId),
    [workspace],
  );
  const handleRevealMessage = useMemo(
    () => (messageId: string) => workspace.getActiveController()?.markSeen(messageId),
    [workspace],
  );

  const handleSelectContact = (id: string) => {
    workspace.setActive(id);
    setView("conversation");
  };

  // The actual removal from the list happens via workspace.removeContact(), triggered by the
  // contact:removed broadcast this round-trips through the background (see backendTransport.ts) —
  // not applied optimistically here, so every open tab (this one included) updates the same way.
  const handleRemoveContact = (id: string, name: string) => {
    if (!confirm(`Disconnect ${name}? You'll need a new invite code to pair with them again.`)) return;
    const request: OutboundToBackground = { type: "contact:remove", contactId: id };
    chrome.runtime.sendMessage(request).then((response: RemoveContactResponse | undefined) => {
      if (response && !response.ok) alert(response.error);
    });
  };

  const handleFabPointerDown = (event: React.PointerEvent) => {
    primeAudio();
    draggable.onPointerDown(event);
  };

  const handleLeftClick = () => {
    if (draggable.consumeDragged()) return;
    // Peek shows a preview of one contact's conversation — with no contacts at all there's
    // nothing to preview, so fall back to the same full contacts-list view a right-click opens
    // (which shows ContactList's own "no contacts yet, use the popup" empty state) instead of
    // silently toggling disclosure.mode with no panel actually rendering (see the activeState
    // guards below, now removed for ChatPanel specifically so this has something to show).
    if (workspace.getContactIds().length === 0) {
      disclosure.openFull();
      setView("list");
      return;
    }
    disclosure.openPeek();
  };

  const handleCalloutClick = () => {
    setCalloutVisible(false);
    disclosure.openPeek();
  };

  const handleRightClick = () => {
    if (draggable.consumeDragged()) return;
    const wasClosed = disclosure.mode !== "full";
    disclosure.openFull();
    if (wasClosed) setView("list");
  };

  const handleExpand = () => {
    disclosure.openFull();
    setView("conversation");
  };

  // Optimistic locally (instant feedback), then persisted server-side so it survives a reload
  // and shows up the same way on any other device paired to this account — display_name lives on
  // the contact row itself now, not a separate local-only override (see backend/src/routes/pairing.py's
  // PATCH /contacts/{id}). A failure just logs; the name was already applied everywhere it's
  // visible right now, and the next successful GET /contacts will resync if it silently reverted.
  const handleRenameContact = (name: string) => {
    const contactId = workspace.getActiveId();
    if (contactId === undefined) return;
    workspace.getController(contactId)?.renameContact(name);
    const request: OutboundToBackground = { type: "contact:rename", contactId, name };
    chrome.runtime.sendMessage(request).then((response: RenameContactResponse | undefined) => {
      if (response && !response.ok) console.warn(`[private-chat] rename failed: ${response.error}`);
    });
  };

  const emojiTheme = settings.theme === "system" ? "auto" : settings.theme === "light" ? "light" : "dark";

  // null until at least one contact exists (real contacts arrive asynchronously — see the
  // contacts:request-list effect above; demo mode always has its seeds by construction).
  const activeState = workspace.getActiveController()?.getState() ?? null;

  if (!settings.extensionEnabled || !settings.showFab) return null;

  const fabConnectionStatus = connectionStatus === "off" ? "connecting" : connectionStatus;

  return (
    <div
      className="pco-root"
      data-theme={settings.theme}
      ref={rootRef}
      // Keyboard/mouse events fired inside a shadow tree still bubble (compose) out past its
      // boundary into the host page's own document-level listeners — that's standard, not a
      // leak specific to this extension. A page's own hotkey system (GitHub's single-letter
      // shortcuts, e.g.) can't tell you were actually typing into *our* input, since
      // document.activeElement from outside a shadow root only ever reports the shadow host, never
      // the real focused element inside it — so it fires anyway. Stopping propagation at our own
      // root is what actually confines interaction with this overlay to this overlay, for anything
      // that reaches here (only ever things already inside an interactive part of it — everything
      // else is pointer-events: none and never dispatches here to begin with). React's portal-aware
      // bubbling means this also covers the emoji popover, even though it portals to a different
      // DOM location outside this element.
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <div className="pco-portal-layer" ref={portalRef} />

      <FabCharacter
        layer="back"
        position={draggable.position}
        phase={character.phase}
        playfulKind={character.playfulKind}
        animationKey={character.animationKey}
      />

      <Fab
        ref={fabRef}
        isOpen={disclosure.mode !== "hidden"}
        connectionStatus={fabConnectionStatus}
        unreadCount={workspace.getTotalUnread()}
        pulseKey={pulseKey}
        quietMode={settings.quietMode}
        position={draggable.position}
        onPointerDown={handleFabPointerDown}
        onLeftClick={handleLeftClick}
        onRightClick={handleRightClick}
        onMouseEnter={handleFabEnter}
        onMouseLeave={handleZoneLeave}
      />

      <FabCharacter
        layer="front"
        position={draggable.position}
        phase={character.phase}
        playfulKind={character.playfulKind}
        animationKey={character.animationKey}
      />

      <FabCallout visible={calloutVisible} anchor={calloutAnchor} onClick={handleCalloutClick} text={calloutText} />

      {activeState && (
        <PeekPanel
          isOpen={disclosure.mode === "peek"}
          instant={disclosure.instant}
          anchor={anchor}
          contactName={activeState.contact.name}
          connected={activeState.contact.connected}
          messages={activeState.messages}
          remoteTyping={activeState.remoteTyping}
          draft={activeState.draft}
          onDraftChange={handleDraftChange}
          onSend={handleSend}
          onRetry={handleRetry}
          onRevealMessage={handleRevealMessage}
          privacyMode={settings.privacyMode}
          quickReplies={settings.quickReplies}
          onExpand={handleExpand}
          onClose={disclosure.close}
          onMouseEnter={handleZoneEnter}
          onMouseLeave={handleZoneLeave}
          onComposerFocusChange={setComposerFocused}
          emojiTheme={emojiTheme}
          portalRef={portalRef}
        />
      )}

      <ChatPanel
        state={activeState}
        isOpen={disclosure.mode === "full"}
        instant={disclosure.instant}
        sidebar={sidebar}
        onSend={handleSend}
        onDraftChange={handleDraftChange}
        onRetry={handleRetry}
        onRevealMessage={handleRevealMessage}
        onClose={disclosure.close}
        privacyMode={settings.privacyMode}
        showStatus={settings.showStatus}
        quickReplies={settings.quickReplies}
        view={view}
        onShowList={() => setView("list")}
        contactIds={workspace.getContactIds()}
        getController={(id) => workspace.getController(id)}
        activeId={workspace.getActiveId() ?? ""}
        onSelectContact={handleSelectContact}
        onRemoveContact={handleRemoveContact}
        onMouseEnter={handleZoneEnter}
        onMouseLeave={handleZoneLeave}
        onComposerFocusChange={setComposerFocused}
        onRenameContact={handleRenameContact}
        emojiTheme={emojiTheme}
        portalRef={portalRef}
      />
    </div>
  );
}
