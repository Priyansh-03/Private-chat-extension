import { useEffect, useState } from "react";
import { loadSettings, replaceSettings } from "../lib/settingsStore";
import { DEFAULT_SETTINGS, type Settings, type ThemeMode } from "../lib/types";
import { Toggle } from "./Toggle";
import { QuickReplyEditor } from "./QuickReplyEditor";
import { ShortcutEditor } from "./ShortcutEditor";

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "transparent", label: "Transparent" },
];

export function SettingsPopup() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void replaceSettings(next);
      return next;
    });
  };

  if (!settings) return <div className="pcp-root pcp-loading">Loading…</div>;

  return (
    <div className="pcp-root">
      <div className="pcp-title">Private Chat</div>

      <div className="pcp-row">
        <span>Extension</span>
        <Toggle checked={settings.extensionEnabled} onChange={(v) => update({ extensionEnabled: v })} label="Extension" />
      </div>

      <div className="pcp-row">
        <span>Quiet Mode</span>
        <Toggle checked={settings.quietMode} onChange={(v) => update({ quietMode: v })} label="Quiet Mode" />
      </div>

      <div className="pcp-row">
        <span>Privacy Mode</span>
        <Toggle checked={settings.privacyMode} onChange={(v) => update({ privacyMode: v })} label="Privacy Mode" />
      </div>

      <div className="pcp-row">
        <span>Theme</span>
        <select
          className="pcp-select"
          value={settings.theme}
          onChange={(event) => update({ theme: event.target.value as ThemeMode })}
        >
          {THEMES.map((theme) => (
            <option key={theme.value} value={theme.value}>
              {theme.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pcp-row">
        <span>Sound</span>
        <Toggle checked={settings.sound} onChange={(v) => update({ sound: v })} label="Sound" />
      </div>

      <div className="pcp-row">
        <span>Show Status</span>
        <Toggle checked={settings.showStatus} onChange={(v) => update({ showStatus: v })} label="Show Status" />
      </div>

      <QuickReplyEditor replies={settings.quickReplies} onChange={(quickReplies) => update({ quickReplies })} />

      <ShortcutEditor shortcuts={settings.shortcuts} onChange={(shortcuts) => update({ shortcuts })} />

      <button
        type="button"
        className="pcp-reset"
        onClick={() => update(DEFAULT_SETTINGS)}
      >
        Reset to defaults
      </button>
    </div>
  );
}
