const IDENTITY_STORAGE_KEY = "pco_device_identity";

export interface DeviceIdentity {
  deviceId: string;
  authToken: string;
}

export async function loadDeviceIdentity(): Promise<DeviceIdentity | null> {
  const stored = (await chrome.storage.local.get(IDENTITY_STORAGE_KEY))[IDENTITY_STORAGE_KEY] as
    | DeviceIdentity
    | undefined;
  return stored ?? null;
}

export async function saveDeviceIdentity(identity: DeviceIdentity): Promise<void> {
  await chrome.storage.local.set({ [IDENTITY_STORAGE_KEY]: identity });
}
