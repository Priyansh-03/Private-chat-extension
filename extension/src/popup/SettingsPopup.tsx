import { useEffect, useState } from "react";
import { loadSettings, replaceSettings } from "../lib/settingsStore";
import { playNotificationSound } from "../lib/sound";
import { DEFAULT_SETTINGS, type NotificationSound, type Settings, type ThemeMode } from "../lib/types";
import { Toggle } from "./Toggle";
import { QuickReplyEditor } from "./QuickReplyEditor";

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "transparent", label: "Transparent" },
];

const NOTIFICATION_SOUNDS: { value: NotificationSound; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "pop", label: "Pop" },
  { value: "ding", label: "Ding" },
];

export function SettingsPopup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSaveError(false);
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      replaceSettings(next).catch(() => {
        setSettings(prev);
        setSaveError(true);
      });
      return next;
    });
  };

  if (!settings) return <div className="pcp-root pcp-loading">Loading…</div>;

  return (
    <div className="pcp-root">
      <div className="pcp-title">
        <img src="logo.svg" alt="" className="pcp-logo" />
        Private Chat
      </div>

      {saveError && <div className="pcp-error">Couldn&apos;t save — try again.</div>}

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

      {settings.sound && (
        <div className="pcp-row">
          <span>Notification Sound</span>
          <div className="pcp-sound-picker">
            <select
              className="pcp-select"
              value={settings.notificationSound}
              onChange={(event) => update({ notificationSound: event.target.value as NotificationSound })}
            >
              {NOTIFICATION_SOUNDS.map((sound) => (
                <option key={sound.value} value={sound.value}>
                  {sound.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pcp-btn"
              aria-label="Preview notification sound"
              onClick={() => playNotificationSound(settings.notificationSound)}
            >
              ▶
            </button>
          </div>
        </div>
      )}

      <div className="pcp-row">
        <span>Show Status</span>
        <Toggle checked={settings.showStatus} onChange={(v) => update({ showStatus: v })} label="Show Status" />
      </div>

      <QuickReplyEditor replies={settings.quickReplies} onChange={(quickReplies) => update({ quickReplies })} />

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
