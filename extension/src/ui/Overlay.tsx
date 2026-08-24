import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createDemoSeeds } from "../lib/devSeed";
import { playIncomingChime } from "../lib/sound";
import type { ChatWorkspace as ChatWorkspaceType } from "../lib/workspace";
import { ChatWorkspace } from "../lib/workspace";
import type { InboundFromBackground, OutboundToBackground } from "../lib/transportProtocol";
import type { ConnectionStatus, DisclosureMode } from "../lib/types";
import { Fab } from "./Fab";
import { FabCallout, CALLOUT_SIZE } from "./FabCallout";
import { PeekPanel, PEEK_SIZE } from "./PeekPanel";
import { ChatPanel } from "./ChatPanel";
import { useChatDisclosure } from "./hooks/useChatDisclosure";
import { useDraggable } from "./hooks/useDraggable";
import { usePanelAnchor } from "./hooks/usePanelAnchor";
import { useSidebarWidth } from "./hooks/useSidebarWidth";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
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

  const disclosure = useChatDisclosure(rootRef);
  const draggable = useDraggable();
  const sidebar = useSidebarWidth();
  const [view, setView] = useState<"list" | "conversation">("conversation");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [pulseKey, setPulseKey] = useState(0);
  const [calloutVisible, setCalloutVisible] = useState(false);
  const calloutTimer = useRef<ReturnType<typeof setTimeout>>();
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Peek is a compact card anchored next to wherever the FAB currently is.
  // Full Chat is a right-edge-docked sidebar (see .pco-panel in overlay.css)
  // and deliberately does not use this anchor — it's pinned regardless of
  // FAB position.
  const anchor = usePanelAnchor(disclosure.mode === "peek", fabRef, PEEK_SIZE);
  const calloutAnchor = usePanelAnchor(calloutVisible, fabRef, CALLOUT_SIZE);

  // Defensive re-sync: re-read settings the moment a panel opens, in case a
  // storage.onChanged event was ever missed while hidden.
  useEffect(() => {
    if (disclosure.mode !== "hidden") refreshSettings();
  }, [disclosure.mode, refreshSettings]);

  const modeRef = useRef<DisclosureMode>(disclosure.mode);
  modeRef.current = disclosure.mode;

  // Re-render whenever any conversation's state changes (messages, ticks, typing, drafts, presence).
  useEffect(() => workspace.onAnyChange(forceRender), [workspace]);

  // New-message pulse + callout + sound, suppressed by Quiet Mode / not while that conversation is already open.
  useEffect(
    () =>
      workspace.onIncoming((contactId) => {
        const conversationVisible = modeRef.current !== "hidden" && workspace.getActiveId() === contactId;
        if (conversationVisible) return;
        setPulseKey((key) => key + 1);
        if (settings.sound && !settings.quietMode) playIncomingChime();
        if (!settings.quietMode) {
          setCalloutVisible(true);
          if (calloutTimer.current) clearTimeout(calloutTimer.current);
          calloutTimer.current = setTimeout(() => setCalloutVisible(false), 4500);
        }
      }),
    [workspace, settings.sound, settings.quietMode],
  );

  // Any panel opening dismisses the callout immediately.
  useEffect(() => {
    if (disclosure.mode !== "hidden") {
      setCalloutVisible(false);
      if (calloutTimer.current) clearTimeout(calloutTimer.current);
    }
  }, [disclosure.mode]);

  // Background service worker connection: initial status + live event stream.
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

  useKeyboardShortcuts(settings.shortcuts, {
    toggleHide: () => {
      if (!settings.extensionEnabled) return;
      if (disclosure.mode === "hidden") disclosure.openPeek();
      else disclosure.close();
    },
    openPeek: () => {
      if (settings.extensionEnabled) disclosure.openPeek();
    },
  });

  const handleSend = useMemo(() => (text: string) => workspace.getActiveController().sendMessage(text), [workspace]);
  const handleDraftChange = useMemo(
    () => (text: string) => workspace.getActiveController().setDraft(text),
    [workspace],
  );
  const handleRetry = useMemo(
    () => (messageId: string) => workspace.getActiveController().retryMessage(messageId),
    [workspace],
  );

  const handleSelectContact = (id: string) => {
    workspace.setActive(id);
    setView("conversation");
    workspace.getController(id)?.clearUnread();
  };

  const handleLeftClick = () => {
    if (draggable.consumeDragged()) return;
    const wasClosed = disclosure.mode !== "peek";
    disclosure.openPeek();
    if (wasClosed) workspace.getActiveController().clearUnread();
  };

  const handleCalloutClick = () => {
    setCalloutVisible(false);
    disclosure.openPeek();
    workspace.getActiveController().clearUnread();
  };

  const handleRightClick = () => {
    if (draggable.consumeDragged()) return;
    const wasClosed = disclosure.mode !== "full";
    disclosure.openFull();
    if (wasClosed) {
      setView("conversation");
      workspace.getActiveController().clearUnread();
    }
  };

  const handleExpand = () => {
    disclosure.openFull();
    setView("conversation");
  };

  if (!settings.extensionEnabled) return null;

  const activeState = workspace.getActiveController().getState();
  const lastMessage = activeState.messages[activeState.messages.length - 1];
  const fabConnectionStatus = connectionStatus === "off" ? "connecting" : connectionStatus;

  return (
    <div className="pco-root" data-theme={settings.theme} ref={rootRef}>
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
      />

      <FabCallout visible={calloutVisible} anchor={calloutAnchor} onClick={handleCalloutClick} />

      <PeekPanel
        isOpen={disclosure.mode === "peek"}
        instant={disclosure.instant}
        anchor={anchor}
        contactName={activeState.contact.name}
        lastMessage={lastMessage}
        draft={activeState.draft}
        onDraftChange={handleDraftChange}
        onSend={handleSend}
        onRetry={handleRetry}
        privacyMode={settings.privacyMode}
        quickReplies={settings.quickReplies}
        onExpand={handleExpand}
        onClose={disclosure.close}
      />

      <ChatPanel
        state={activeState}
        isOpen={disclosure.mode === "full"}
        instant={disclosure.instant}
        sidebar={sidebar}
        onSend={handleSend}
        onDraftChange={handleDraftChange}
        onRetry={handleRetry}
        onClose={disclosure.close}
        privacyMode={settings.privacyMode}
        quickReplies={settings.quickReplies}
        view={view}
        onShowList={() => setView("list")}
        contactIds={workspace.getContactIds()}
        getController={(id) => workspace.getController(id)}
        activeId={workspace.getActiveId()}
        onSelectContact={handleSelectContact}
      />
    </div>
  );
}
