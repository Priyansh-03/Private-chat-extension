interface RefreshButtonProps {
  onRefresh: () => void;
  refreshing: boolean;
}

/** Header affordance in both the peek card and the full panel — forces a fresh pull of every
 * conversation's history from the server (see Overlay's syncFromServer), for when live sync in a
 * background tab has drifted. */
export function RefreshButton({ onRefresh, refreshing }: RefreshButtonProps) {
  return (
    <button
      type="button"
      className={`pco-header__btn${refreshing ? " pco-header__btn--spinning" : ""}`}
      aria-label="Refresh messages"
      title="Refresh messages"
      disabled={refreshing}
      onClick={onRefresh}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
