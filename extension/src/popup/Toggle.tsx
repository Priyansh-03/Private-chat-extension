interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`pcp-toggle${checked ? " pcp-toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="pcp-toggle__thumb" />
    </button>
  );
}
