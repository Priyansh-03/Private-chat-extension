import { useCallback, useEffect, useState } from "react";
import { loadSettings, onSettingsChanged } from "../../lib/settingsStore";
import { DEFAULT_SETTINGS, type Settings } from "../../lib/types";

export interface SettingsApi {
  settings: Settings;
  /** Force a fresh read from chrome.storage — a defensive re-sync, e.g. right as a panel opens. */
  refresh: () => void;
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const refresh = useCallback(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    const unsubscribe = onSettingsChanged(setSettings);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { settings, refresh };
}
