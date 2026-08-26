import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { USE_REAL_BACKEND } from "../lib/backendConfig";
import { MESSAGE_NOTICE_DURATION_MS, PANEL_AUTO_CLOSE_MS } from "../lib/constants";
import { createDemoSeeds } from "../lib/devSeed";
import { getUnseenIncoming } from "../lib/chatEventBus";
import { playNotificationSound, primeAudio } from "../lib/sound";
import { loadContactNameOverrides, onContactNameOverridesChanged, saveContactName } from "../lib/contactOverrides";
import type { ChatWorkspace as ChatWorkspaceType } from "../lib/workspace";
import { ChatWorkspace } from "../lib/workspace";
import type {
  InboundFromBackground,
  OutboundToBackground,
  PendingIncomingEntry,
  RemoteContactSnapshot,
  RemoveContactResponse,
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

  // Real contacts arrive asynchronously: an initial fetch here, then live contact:added events
  // via the existing workspace.route() call below (both the inviter and the acceptor side of a
  // pairing get one — see backendTransport.ts). Demo mode already has its seeds at construction.
  // Silent: these are pre-existing contacts this tab is just learning about, not new pairings —
  // otherwise the "New contact added" callout would replay for all of them on every page load.
  useEffect(() => {
    if (!USE_REAL_BACKEND) return;
    let cancelled = false;
    const request: OutboundToBackground = { type: "contacts:request-list" };
    chrome.runtime.sendMessage(request).then((contacts: RemoteContactSnapshot[] | undefined) => {
      if (cancelled || !contacts) return;
      for (const contact of contacts) {
        workspace.addContact(
          {
            contact: {
              id: contact.contactId,
              name: contact.name || defaultContactName(contact.contactId),
              status: contact.status,
              connected: contact.connected,
            },
          },
          { silent: true },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  // Messages that arrived while no tab was open to receive them live (see backendTransport.ts's
  // incoming-inbox) — claimed by whichever tab starts up first. route() already buffers a
  // chat:incoming for a contact this tab hasn't loaded yet (see pendingEvents), so this doesn't
  // need to wait on the contacts fetch above. Not silent — the user genuinely hasn't seen these.
  useEffect(() => {
    if (!USE_REAL_BACKEND) return;
    let cancelled = false;
    const request: OutboundToBackground = { type: "chat:request-pending" };
    chrome.runtime.sendMessage(request).then((pending: PendingIncomingEntry[] | undefined) => {
      if (cancelled || !pending) return;
      for (const entry of pending) {
        workspace.route({ type: "chat:incoming", contactId: entry.contactId, message: entry.message });
      }
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

  // Apply any saved contact renames into the live controllers (initial load, then live updates
  // from other tabs/the popup) — the controllers are the single source of truth for display name.
  useEffect(() => {
    let cancelled = false;
    const applyOverrides = (overrides: Record<string, string>) => {
      if (cancelled) return;
      for (const [contactId, name] of Object.entries(overrides)) {
        workspace.getController(contactId)?.renameContact(name);
      }
    };
    loadContactNameOverrides().then(applyOverrides);
    const unsubscribe = onContactNameOverridesChanged(applyOverrides);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [workspace]);

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

  const handleRenameContact = (name: string) => {
    const contactId = workspace.getActiveId();
    if (contactId === undefined) return;
    workspace.getController(contactId)?.renameContact(name);
    void saveContactName(contactId, name);
  };

  const emojiTheme = settings.theme === "system" ? "auto" : settings.theme === "light" ? "light" : "dark";

  // null until at least one contact exists (real contacts arrive asynchronously — see the
  // contacts:request-list effect above; demo mode always has its seeds by construction).
  const activeState = workspace.getActiveController()?.getState() ?? null;
  const lastMessage = activeState?.messages[activeState.messages.length - 1];

  // Which messages appear in peek is a snapshot taken at open time, not fully live — otherwise
  // hovering the top (oldest) message removes it and the next one can slide under the cursor and
  // get marked seen too, without a real hover. But two things must still track live: a message
  // sent or received *after* that snapshot (e.g. you type and send while peek is still open) needs
  // to show up, and a captured message's delivery ticks (sending -> delivered -> read) need to
  // keep updating rather than freezing at whatever state they were in at snapshot time. So only
  // *membership* (which ids are shown, and their order) is frozen/append-only; the message objects
  // themselves are always resolved fresh from live state.
  const peekBatchRef = useRef<ChatMessage[]>([]);
  const peekIdsRef = useRef<string[]>([]);
  const peekSnapshotKeyRef = useRef<string | null>(null);
  if (disclosure.mode === "peek" && activeState) {
    const activeId = workspace.getActiveId() ?? null;
    if (peekSnapshotKeyRef.current !== activeId) {
      peekSnapshotKeyRef.current = activeId;
      const unseen = getUnseenIncoming(activeState.messages);
      const initial = unseen.length > 0 ? unseen : lastMessage ? [lastMessage] : [];
      peekIdsRef.current = initial.map((m) => m.id);
    } else {
      const knownIds = new Set(peekIdsRef.current);
      for (const message of activeState.messages) {
        if (!knownIds.has(message.id)) {
          peekIdsRef.current.push(message.id);
          knownIds.add(message.id);
        }
      }
    }
    const byId = new Map(activeState.messages.map((m) => [m.id, m]));
    peekBatchRef.current = peekIdsRef.current.map((id) => byId.get(id)).filter((m): m is ChatMessage => m !== undefined);
  } else {
    peekSnapshotKeyRef.current = null;
    peekIdsRef.current = [];
  }

  if (!settings.extensionEnabled || !settings.showFab) return null;

  const fabConnectionStatus = connectionStatus === "off" ? "connecting" : connectionStatus;

  return (
    <div className="pco-root" data-theme={settings.theme} ref={rootRef}>
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
          messages={peekBatchRef.current}
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
