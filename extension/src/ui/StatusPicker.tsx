import { useEffect, useRef, useState } from "react";
import { MY_STATUS_LABELS, type MyStatusPreset } from "../lib/types";

const PRESETS = Object.keys(MY_STATUS_LABELS) as MyStatusPreset[];

interface StatusPickerProps {
  status: MyStatusPreset;
  onChange: (status: MyStatusPreset) => void;
}

/** My own status — a local preset, shown to the user; broadcasting it to contacts needs a real backend. */
export function StatusPicker({ status, onChange }: StatusPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !event.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  return (
    <div className="pco-status-picker" ref={wrapRef}>
      <button
        type="button"
        className="pco-status-picker__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`My status: ${MY_STATUS_LABELS[status]}`}
      >
        <span className={`pco-status-picker__dot pco-status-picker__dot--${status}`} />
        {MY_STATUS_LABELS[status]}
      </button>
      {open && (
        <div className="pco-status-picker__menu">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`pco-status-picker__option${preset === status ? " pco-status-picker__option--active" : ""}`}
              onClick={() => {
                onChange(preset);
                setOpen(false);
              }}
            >
              <span className={`pco-status-picker__dot pco-status-picker__dot--${preset}`} />
              {MY_STATUS_LABELS[preset]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
