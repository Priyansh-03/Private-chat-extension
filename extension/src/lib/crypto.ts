import nacl from "tweetnacl";
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from "tweetnacl-util";

const KEY_STORAGE_KEY = "pco_device_keypair";

export interface DeviceKeyPair {
  publicKey: string;
  secretKey: string;
}

/** Generated once per install, persisted to chrome.storage.local (never sync) — the secret key
 * must never leave this device. */
export async function loadOrCreateKeyPair(): Promise<DeviceKeyPair> {
  const stored = (await chrome.storage.local.get(KEY_STORAGE_KEY))[KEY_STORAGE_KEY] as DeviceKeyPair | undefined;
  if (stored) return stored;

  const pair = nacl.box.keyPair();
  const keyPair: DeviceKeyPair = {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey),
  };
  await chrome.storage.local.set({ [KEY_STORAGE_KEY]: keyPair });
  return keyPair;
}

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
}

/** NaCl box: X25519 key agreement + XSalsa20-Poly1305, matching the backend's encryption model —
 * the server only ever sees this output, never the plaintext or either secret key. */
export function encryptMessage(plaintext: string, peerPublicKeyB64: string, mySecretKeyB64: string): EncryptedPayload {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(decodeUTF8(plaintext), nonce, decodeBase64(peerPublicKeyB64), decodeBase64(mySecretKeyB64));
  return { ciphertext: encodeBase64(box), nonce: encodeBase64(nonce) };
}

/** Returns null if the ciphertext doesn't authenticate (wrong key, corrupted, or tampered) — also
 * for malformed base64 input, which decodeBase64 throws on rather than returning a failure value. */
export function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  peerPublicKeyB64: string,
  mySecretKeyB64: string,
): string | null {
  let opened: Uint8Array | null;
  try {
    opened = nacl.box.open(
      decodeBase64(ciphertextB64),
      decodeBase64(nonceB64),
      decodeBase64(peerPublicKeyB64),
      decodeBase64(mySecretKeyB64),
    );
  } catch {
    return null;
  }
  return opened ? encodeUTF8(opened) : null;
}
