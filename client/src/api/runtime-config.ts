/**
 * Runtime configuration.
 *
 * The frontend can be deployed as a pure static site on a different host than
 * the backend. In that case the backend origin is read at runtime from
 * `config.json` in the public directory, so the same build artifact can be
 * pointed at different backends without rebuilding.
 *
 * Precedence: build-time `VITE_API_BASE_URL` → `config.json` → same origin.
 */
export interface RuntimeConfig {
  apiBaseUrl: string;
}

let current: RuntimeConfig = { apiBaseUrl: "" };

function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const envBase = normalizeBase(import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (envBase) {
    current = { apiBaseUrl: envBase };
    return current;
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      cache: "no-store",
      credentials: "omit",
    });
    if (response.ok) {
      const data = (await response.json()) as Partial<RuntimeConfig>;
      current = { apiBaseUrl: normalizeBase(data.apiBaseUrl) };
    }
  } catch {
    // A missing or unreachable config.json simply means "same origin".
  }

  return current;
}

export function getApiBaseUrl(): string {
  return current.apiBaseUrl;
}

/** True when the UI and the API live on different origins. */
export function isCrossOriginApi(): boolean {
  return current.apiBaseUrl !== "";
}

/** Resolve an API path against the configured backend origin. */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!current.apiBaseUrl) return path;
  return current.apiBaseUrl + (path.startsWith("/") ? path : `/${path}`);
}
