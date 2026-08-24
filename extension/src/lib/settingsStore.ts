import { DEFAULT_SETTINGS, type Settings } from "./types";

const SETTINGS_KEY = "pco_settings";
const FAB_POSITION_KEY = "pco_fab_position";

export interface FabPosition {
  x: number;
  y: number;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] as Partial<Settings> | undefined) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Writes the full object as-is (no read-modify-write) so two rapid popup edits can't race and drop one another. */
export async function replaceSettings(next: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
    callback({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined) });
  };
  try {
    chrome.storage.onChanged.addListener(listener);
  } catch {
    // invalidated extension context; nothing to subscribe to
  }
  return () => {
    try {
      chrome.storage.onChanged.removeListener(listener);
    } catch {
      // already gone
    }
  };
}

export async function loadFabPosition(): Promise<FabPosition | null> {
  try {
    const result = await chrome.storage.local.get(FAB_POSITION_KEY);
    return (result[FAB_POSITION_KEY] as FabPosition | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveFabPosition(position: FabPosition): Promise<void> {
  await chrome.storage.local.set({ [FAB_POSITION_KEY]: position });
}
