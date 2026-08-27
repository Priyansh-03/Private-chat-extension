// Centralized, non-secret configuration values — see rules.md §4. Keep every operationally
// tunable timing/size constant here instead of inline, so there's exactly one place to change it.

// ---------- Content script (content/index.tsx, background/index.ts) ----------
// Shared so the background script can recognize (and clean up) a stale instance left over from
// before an extension reload — see background/index.ts's injectIntoExistingTabs.
export const OVERLAY_HOST_ID = "private-chat-overlay-host";

// ---------- FAB geometry + drag (useDraggable.ts) ----------
export const FAB_SIZE = 52;
export const FAB_MARGIN = 20;
export const FAB_DRAG_THRESHOLD = 4;

// ---------- Typing indicator (chatEventBus.ts) ----------
export const TYPING_INACTIVITY_MS = 3000;
export const REMOTE_TYPING_FAILSAFE_MS = 8000;

// ---------- Mascot animation timing (hooks/useFabCharacter.ts) ----------
export const MASCOT_IDLE_MIN_MS = 15000;
export const MASCOT_IDLE_MAX_MS = 30000;
export const MASCOT_EMERGE_MS = 550;
export const MASCOT_PLAYFUL_IDLE_MS = 1000;
export const MASCOT_HIDE_MS = 500;

// Shared by the FAB callout, the mascot's extended "wave" stay, and nothing else reads a
// different value for the same event — keeping them on one constant means they can't drift apart.
export const MESSAGE_NOTICE_DURATION_MS = 4500;

// ---------- Panel behavior (Overlay.tsx) ----------
export const PANEL_AUTO_CLOSE_MS = 8000;

// ---------- Mock transport (background/mockTransport.ts) ----------
// Stand-ins for real network/server latency; replace wholesale when a real backend exists.
export const MOCK_CONNECT_DELAY_MS = 500;
export const MOCK_CONNECT_DELAY_JITTER_MS = 400;
export const MOCK_PRESENCE_FLIP_INTERVAL_MS = 25_000;
export const MOCK_PRESENCE_FLIP_JITTER_MS = 15_000;
export const MOCK_TYPING_DURATION_MS = 1200;
export const MOCK_TYPING_DURATION_JITTER_MS = 1500;
export const MOCK_DEMO_MESSAGE_INTERVAL_MS = 30_000;
export const MOCK_DEMO_MESSAGE_JITTER_MS = 20_000;
export const MOCK_ACK_DELAY_MS = 250;
export const MOCK_ACK_DELAY_JITTER_MS = 350;
export const MOCK_DELIVERY_DELAY_MS = 300;
export const MOCK_DELIVERY_DELAY_JITTER_MS = 500;
export const MOCK_READ_DELAY_MS = 2000;
export const MOCK_READ_DELAY_JITTER_MS = 5000;
export const MOCK_OFFLINE_TTL_MS = 45_000;

// ---------- Real backend transport (background/backendTransport.ts) ----------
// Exponential backoff + jitter on WS reconnect — a tight retry loop against a flaky connection
// is a real CPU/battery/network drain on a weak laptop (see backend plan's Performance section).
export const WS_RECONNECT_BASE_DELAY_MS = 1_000;
export const WS_RECONNECT_MAX_DELAY_MS = 30_000;
export const WS_RECONNECT_JITTER_MS = 500;

// Browser WebSocket has no JS-visible native ping/pong — this app-level pair is what actually
// detects a zombie connection (readyState still OPEN, but nothing's really flowing) instead of
// waiting indefinitely. Comfortably under Chrome's ~30s MV3 service-worker idle window.
export const WS_PING_INTERVAL_MS = 20_000;
export const WS_PONG_TIMEOUT_MS = 15_000;

// ---------- Service worker keepalive (background/index.ts) ----------
// A chrome.alarms firing is one of the few things guaranteed to wake an idle-killed MV3 service
// worker back up — this is a self-healing check, not a guarantee the SW never dies between
// firings. 1 is the minimum periodInMinutes Chrome honors for a packed extension.
export const KEEPALIVE_ALARM_NAME = "pco-keepalive";
export const KEEPALIVE_ALARM_PERIOD_MINUTES = 1;
