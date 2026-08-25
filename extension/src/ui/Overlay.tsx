import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createDemoSeeds } from "../lib/devSeed";
import { getUnseenIncoming } from "../lib/chatEventBus";
import { playIncomingChime } from "../lib/sound";
import { replaceSettings } from "../lib/settingsStore";
import type { ChatWorkspace as ChatWorkspaceType } from "../lib/workspace";
import { ChatWorkspace } from "../lib/workspace";
import type { InboundFromBackground, OutboundToBackground } from "../lib/transportProtocol";
import type { ChatMessage, ConnectionStatus, DisclosureMode, MyStatusPreset } from "../lib/types";
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
  if (!workspaceRef.current) workspaceRef.current = new ChatWorkspace(createDemoSeeds());
  const workspace = workspaceRef.current;

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
    const timer = setTimeout(() => disclosure.close(), 8000);
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

  // New-message pulse + callout + sound, suppressed by Quiet Mode or if that conversation is already open.
  useEffect(
    () =>
      workspace.onIncoming((contactId) => {
        const conversationVisible = modeRef.current !== "hidden" && workspace.getActiveId() === contactId;
        if (conversationVisible) return;
        setPulseKey((key) => key + 1);
        character.triggerMessage();
        if (settings.sound && !settings.quietMode) playIncomingChime();
        if (!settings.quietMode) {
          setCalloutVisible(true);
          if (calloutTimer.current) clearTimeout(calloutTimer.current);
          calloutTimer.current = setTimeout(() => setCalloutVisible(false), 4500);
        }
      }),
    [workspace, settings.sound, settings.quietMode, character.triggerMessage],
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

  const handleSend = useMemo(() => (text: string) => workspace.getActiveController().sendMessage(text), [workspace]);
  const handleDraftChange = useMemo(
    () => (text: string) => workspace.getActiveController().setDraft(text),
    [workspace],
  );
  const handleRetry = useMemo(
    () => (messageId: string) => workspace.getActiveController().retryMessage(messageId),
    [workspace],
  );
  const handleRevealMessage = useMemo(
    () => (messageId: string) => workspace.getActiveController().markSeen(messageId),
    [workspace],
  );

  const handleSelectContact = (id: string) => {
    workspace.setActive(id);
    setView("conversation");
  };

  const handleLeftClick = () => {
    if (draggable.consumeDragged()) return;
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

  const handleMyStatusChange = (myStatus: MyStatusPreset) => {
    void replaceSettings({ ...settings, myStatus });
  };

  const emojiTheme = settings.theme === "system" ? "auto" : settings.theme === "light" ? "light" : "dark";

  const activeState = workspace.getActiveController().getState();
  const lastMessage = activeState.messages[activeState.messages.length - 1];

  // Peek shows a snapshot taken at open time, not a live-recomputed list —
  // otherwise hovering the top (oldest) message removes it and the next one
  // can slide under the cursor and get marked seen too, without a real hover.
  const peekBatchRef = useRef<ChatMessage[]>([]);
  const peekSnapshotKeyRef = useRef<string | null>(null);
  if (disclosure.mode === "peek") {
    const activeId = workspace.getActiveId();
    if (peekSnapshotKeyRef.current !== activeId) {
      peekSnapshotKeyRef.current = activeId;
      const unseen = getUnseenIncoming(activeState.messages);
      peekBatchRef.current = unseen.length > 0 ? unseen : lastMessage ? [lastMessage] : [];
    }
  } else {
    peekSnapshotKeyRef.current = null;
  }

  if (!settings.extensionEnabled) return null;

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
        onPointerDown={draggable.onPointerDown}
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

      <FabCallout visible={calloutVisible} anchor={calloutAnchor} onClick={handleCalloutClick} />

      <PeekPanel
        isOpen={disclosure.mode === "peek"}
        instant={disclosure.instant}
        anchor={anchor}
        contactName={activeState.contact.name}
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
        quickReplies={settings.quickReplies}
        view={view}
        onShowList={() => setView("list")}
        contactIds={workspace.getContactIds()}
        getController={(id) => workspace.getController(id)}
        activeId={workspace.getActiveId()}
        onSelectContact={handleSelectContact}
        onMouseEnter={handleZoneEnter}
        onMouseLeave={handleZoneLeave}
        onComposerFocusChange={setComposerFocused}
        myStatus={settings.myStatus}
        onMyStatusChange={handleMyStatusChange}
        emojiTheme={emojiTheme}
        portalRef={portalRef}
      />
    </div>
  );
}
