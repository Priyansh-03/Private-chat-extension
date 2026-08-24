import { DEFAULT_SETTINGS, type Settings } from "./types";

const SETTINGS_KEY = "pco_settings";
const FAB_POSITION_KEY = "pco_fab_position";

export interface FabPosition {
  x: number;
  y: number;
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = { ...current, ...patch };
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

/**
 * Writes a full settings object as-is — no read-modify-write against storage.
 * Use this when the caller already holds the authoritative current value
 * (e.g. the popup's own React state) so two rapid edits can't race and drop
 * one another's patch.
 */
export async function replaceSettings(next: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== "sync" || !changes[SETTINGS_KEY]) return;
    callback({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadFabPosition(): Promise<FabPosition | null> {
  const result = await chrome.storage.local.get(FAB_POSITION_KEY);
  return (result[FAB_POSITION_KEY] as FabPosition | undefined) ?? null;
}

export async function saveFabPosition(position: FabPosition): Promise<void> {
  await chrome.storage.local.set({ [FAB_POSITION_KEY]: position });
}
