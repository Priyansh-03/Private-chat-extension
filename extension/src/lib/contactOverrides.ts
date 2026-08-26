const CONTACT_NAMES_KEY = "pco_contact_names";

export type ContactNameOverrides = Record<string, string>;

export async function loadContactNameOverrides(): Promise<ContactNameOverrides> {
  try {
    const result = await chrome.storage.local.get(CONTACT_NAMES_KEY);
    return (result[CONTACT_NAMES_KEY] as ContactNameOverrides | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function saveContactName(contactId: string, name: string): Promise<void> {
  const current = await loadContactNameOverrides();
  await chrome.storage.local.set({ [CONTACT_NAMES_KEY]: { ...current, [contactId]: name } });
}

export function onContactNameOverridesChanged(callback: (overrides: ContactNameOverrides) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== "local" || !changes[CONTACT_NAMES_KEY]) return;
    callback((changes[CONTACT_NAMES_KEY].newValue as ContactNameOverrides | undefined) ?? {});
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
