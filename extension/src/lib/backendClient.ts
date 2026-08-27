import { BACKEND_HTTP_URL } from "./backendConfig";

/** Carries the HTTP status + the backend's `detail` message so callers can map known status
 * codes (404/410/400/...) to user-friendly copy instead of surfacing raw API errors — see
 * backendTransport.ts's friendly*Error helpers, which are where that mapping actually lives. */
export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "BackendApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BACKEND_HTTP_URL}${path}`, {
    ...init,
    // Harmless against a non-ngrok backend (an unrecognized header, ignored) — but required
    // whenever BACKEND_HTTP_URL is an ngrok free-tier tunnel: ngrok serves an HTML interstitial
    // page instead of the real response to any request with a browser-like User-Agent (which a
    // real `fetch()` call from the extension always has) unless this header opts out of it.
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true", ...init.headers },
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: unknown) => (body && typeof body === "object" && "detail" in body ? String(body.detail) : null))
      .catch(() => null);
    throw new BackendApiError(response.status, detail ?? response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function authHeaders(authToken: string): Record<string, string> {
  return { Authorization: `Bearer ${authToken}` };
}

export interface RegisterDeviceResult {
  device_id: string;
  auth_token: string;
}

export function registerDevice(publicKey: string): Promise<RegisterDeviceResult> {
  return request("/api/v1/devices/register", {
    method: "POST",
    body: JSON.stringify({ public_key: publicKey }),
  });
}

export interface InviteResult {
  code: string;
  expires_at: string;
}

export function createInvite(authToken: string): Promise<InviteResult> {
  return request("/api/v1/pairing/invite", { method: "POST", headers: authHeaders(authToken) });
}

export interface AcceptInviteResult {
  device_id: string;
  public_key: string;
  display_name: string;
}

export function acceptInvite(authToken: string, code: string, displayName: string): Promise<AcceptInviteResult> {
  return request("/api/v1/pairing/accept", {
    method: "POST",
    headers: authHeaders(authToken),
    body: JSON.stringify({ code, display_name: displayName }),
  });
}

export interface RemoteContact {
  device_id: string;
  display_name: string;
  public_key: string;
  status: "online" | "offline";
  connected: boolean;
}

export function listContacts(authToken: string): Promise<RemoteContact[]> {
  return request("/api/v1/contacts", { headers: authHeaders(authToken) });
}

export function deleteContact(authToken: string, peerDeviceId: string): Promise<void> {
  return request(`/api/v1/contacts/${encodeURIComponent(peerDeviceId)}`, {
    method: "DELETE",
    headers: authHeaders(authToken),
  });
}

export function renameContact(authToken: string, peerDeviceId: string, displayName: string): Promise<void> {
  return request(`/api/v1/contacts/${encodeURIComponent(peerDeviceId)}`, {
    method: "PATCH",
    headers: authHeaders(authToken),
    body: JSON.stringify({ display_name: displayName }),
  });
}

export interface RemoteMessage {
  message_id: string;
  direction: "outgoing" | "incoming";
  ciphertext: string;
  nonce: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

export function fetchMessageHistory(authToken: string, peerDeviceId: string): Promise<RemoteMessage[]> {
  return request(`/api/v1/messages/${encodeURIComponent(peerDeviceId)}`, { headers: authHeaders(authToken) });
}
