/**
 * Runtime configuration.
 *
 * The frontend can be deployed as a pure static site on a different host than
 * the backend. In that case the backend origin is read at runtime from
 * `config.json` in the public directory, so the same build artifact can be
 * pointed at different backends without rebuilding.
 *
 * Precedence: build-time `VITE_API_BASE_URL` → inline `window.__PAC_CONFIG__`
 * (injected into index.html by the backend) → `config.json` → same origin.
 */
export interface RuntimeConfig {
  apiBaseUrl: string;
}

let current: RuntimeConfig = { apiBaseUrl: "" };
/**
 * 解析中的配置 Promise。
 *
 * 首屏挂载不再等待它：`main.ts` 先挂载再并行解析，首个 API 请求通过
 * `ensureRuntimeConfig()` 等待同一个 Promise，避免把一次网络往返压在首次绘制之前。
 */
let pending: Promise<RuntimeConfig> | null = null;

function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

/**
 * 读取服务端内联进 HTML 的运行时配置。
 *
 * 后端渲染 index.html 时会写入 `window.__PAC_CONFIG__`，让配置同步就绪，省掉
 * 「配置 → 会话 → 数据」链条里的第一次往返。纯静态托管（没有服务端注入）时返回
 * null，回退到下面的 config.json。
 */
function readInlineConfig(): RuntimeConfig | null {
  if (typeof window === "undefined") return null;
  const inline = (window as unknown as { __PAC_CONFIG__?: { apiBaseUrl?: unknown } }).__PAC_CONFIG__;
  if (!inline || typeof inline.apiBaseUrl !== "string") return null;
  return { apiBaseUrl: normalizeBase(inline.apiBaseUrl) };
}

async function resolveRuntimeConfig(): Promise<RuntimeConfig> {
  const envBase = normalizeBase(import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (envBase) {
    current = { apiBaseUrl: envBase };
    return current;
  }

  const inlineConfig = readInlineConfig();
  if (inlineConfig) {
    current = inlineConfig;
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

export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  pending ??= resolveRuntimeConfig();
  return pending;
}

/** 等待运行时配置就绪；API 请求必须在上一步完成后再解析后端源。 */
export function ensureRuntimeConfig(): Promise<RuntimeConfig> {
  return loadRuntimeConfig();
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
