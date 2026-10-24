/**
 * Bearer token storage for cross-origin (static frontend) deployments.
 *
 * Same-origin deployments keep using the HttpOnly session cookie, so nothing
 * here is required for them. The token is only written when the backend
 * returns one, which happens for every login (strict or open CORS mode).
 */
const TOKEN_KEY = "pacpilot.adminToken";
const EXPIRES_KEY = "pacpilot.adminTokenExpiresAt";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSessionToken(): string {
  const store = storage();
  if (!store) return "";
  const token = store.getItem(TOKEN_KEY);
  const expiresAt = Number(store.getItem(EXPIRES_KEY) ?? 0);
  if (!token) return "";
  if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
    clearSessionToken();
    return "";
  }
  return token;
}

export function saveSessionToken(token: string | undefined, expiresAt?: number): void {
  const store = storage();
  if (!store || !token) return;
  store.setItem(TOKEN_KEY, token);
  if (expiresAt && Number.isFinite(expiresAt)) store.setItem(EXPIRES_KEY, String(expiresAt));
  else store.removeItem(EXPIRES_KEY);
}

export function clearSessionToken(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(TOKEN_KEY);
  store.removeItem(EXPIRES_KEY);
}
