import type { MessageDeliveryState } from "../lib/types";

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4.65" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.5 3V5.6L7.3 6.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A single WhatsApp-style checkmark. */
function CheckIcon() {
  return (
    <svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden="true">
      <path d="M1 5.1L4.4 8.6L12 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Two overlapping checkmarks drawn as one glyph, matching WhatsApp's tight double-tick — not two separate characters with a gap. */
function DoubleCheckIcon() {
  return (
    <svg width="17" height="10" viewBox="0 0 17 10" fill="none" aria-hidden="true">
      <path d="M1 5.1L4.4 8.6L10.5 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5.1L9.4 8.6L16 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MessageTicksProps {
  state: MessageDeliveryState;
  onRetry: () => void;
}

export function MessageTicks({ state, onRetry }: MessageTicksProps) {
  switch (state) {
    case "sending":
      return (
        <span className="pco-tick" aria-label="Sending">
          <ClockIcon />
        </span>
      );
    case "server_accepted":
    case "pending_delivery":
      return (
        <span className="pco-tick" aria-label="Sent">
          <CheckIcon />
        </span>
      );
    case "delivered":
      return (
        <span className="pco-tick" aria-label="Delivered">
          <DoubleCheckIcon />
        </span>
      );
    case "read":
      return (
        <span className="pco-tick pco-tick--read" aria-label="Read">
          <DoubleCheckIcon />
        </span>
      );
    case "failed":
      return (
        <button type="button" className="pco-tick pco-tick--failed" onClick={onRetry} aria-label="Failed to send, tap to retry">
          Retry
        </button>
      );
    default:
      return null;
  }
}
