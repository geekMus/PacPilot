import { i18n, resolveLocale } from "@/i18n";
import { resolveApiUrl, isCrossOriginApi, ensureRuntimeConfig } from "@/api/runtime-config";
import { readSessionToken, saveSessionToken, clearSessionToken } from "@/api/session-token";
import { emitUnauthorized } from "@/api/auth-events";
import type {
  AppSettings,
  WorkflowRun,
  WorkflowStage,
  WorkflowStatus,
  NotificationChannel,
  NotificationRule,
  DomainEvent,
  NotificationDelivery,
  NotificationEventDefinition,
} from "@shared/contracts";
export type {
  AppSettings,
  WorkflowRun,
  WorkflowStage,
  NotificationChannel,
  NotificationRule,
  DomainEvent,
  NotificationDelivery,
  NotificationEventDefinition,
} from "@shared/contracts";

export interface Meta {
  version: string;
  /** Backend storage driver; lets the UI show what actually stores the data. */
  storageDriver?: "sqlite" | "memory" | string;
}

export interface AdminSession {
  loggedIn: boolean;
  adminCredentialsMissing: boolean;
  /** Transport the backend expects: cookie for same-origin, bearer for split deployments. */
  authMode?: "cookie" | "bearer";
}

export interface PacStatus {
  mode: "custom" | "remote" | "custom_parse_error" | "other" | "empty";
  blockList: string[];
  directList: string[];
  pacProxy: string | null;
  remoteProxyList: string[];
  remoteDirectList: string[];
  remoteProxyCount: number;
  remoteDirectCount: number;
  updatedAt: string;
  timeZone: string;
  hasPac: boolean;
}

export interface WebhookTestResult {
  success: boolean;
  status?: number;
  message: string;
}

export interface SaveAndGenerateResult {
  settings: AppSettings;
  workflowId: number;
  status: WorkflowStatus;
}
export interface GenerateStartResult {
  workflowId: number;
  status: WorkflowStatus;
}

export interface WorkflowDetail {
  run: WorkflowRun;
  stages: WorkflowStage[];
}
export interface PagedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}
export interface WorkflowList {
  current: WorkflowRun | null;
  active: WorkflowRun[];
  runs: WorkflowRun[];
  total: number;
  hasMore: boolean;
}
/** In-memory PAC render reported by the backend (no PAC files on disk). */
export interface PacRenderStatus {
  rendered: {
    exists: boolean;
    sizeBytes: number;
    sourceBytes: number;
    builtAt: string | null;
    etag: string;
    compressed: boolean;
  };
  ruleSource: {
    exists: boolean;
    fetchedAt: string | null;
    url: string;
    format: string;
    proxyHosts: number;
    directHosts: number;
  };
}
export interface StorageSummary {
  dataBytes: number;
  dbBytes: number;
  logBytes: number;
  counts: {
    accessEvents: number;
    workflows: number;
  };
  pac?: PacRenderStatus;
}
export interface PacPilotProbe {
  available: boolean;
  command?: string | null;
  engine?: string;
  detail: string;
}

export interface AccessEvent {
  id: number;
  created_at: string;
  method: string;
  path: string;
  category: "page" | "pac" | "public-api" | "admin-api" | string;
  source_ip: string;
  user_agent: string;
  status_code: number;
  duration_ms: number;
  response_bytes: number;
  query_string?: string;
  host?: string;
  referer?: string;
  accept?: string;
  accept_language?: string;
  content_type?: string;
  /** JSON string of sanitized request headers. */
  request_headers?: string;
  response_content_type?: string;
}

export interface MonitorSummary {
  generatedAt: string;
  timezone: string;
  activeRequests: number;
  tcpConnections: number;
  requestsLastHour: number;
  requestsLast24h: number;
  uniqueSourcesLast24h: number;
  serverErrorsLast24h: number;
  averageResponseMs: number;
  p95ResponseMs: number;
  errorRate: number;
  requestTrend: Array<{ hour: string; requests: number; errors: number }>;
  pacRequestsLastHour: number;
  pacRequestsLast24h: number;
  pacSuccessRate: number;
  pacFailureRequestsLast24h: number;
  pacAverageResponseMs: number;
  latestPacRequest: {
    created_at: string;
    source_ip: string;
    status_code: number;
    duration_ms: number;
  } | null;
  pacRequestTrend: Array<{
    hour: string;
    requests: number;
    errors: number;
    averageResponseMs: number;
  }>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = ""
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Whether the backend expects bearer authentication. `POST /api/admin/login`
 * always returns a token, but a same-origin deployment authenticates with the
 * HttpOnly session cookie instead; persisting the token there would duplicate
 * the credential into localStorage for no reason.
 *
 * Starts as `null` because the runtime config (which decides whether the API is
 * cross-origin) is loaded asynchronously after the module is evaluated.
 */
let bearerRequired: boolean | null = null;
const requiresBearerToken = (): boolean => bearerRequired ?? isCrossOriginApi();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // 首屏挂载不再等待运行时配置，第一个请求必须自己等它解析完成，
  // 否则静态部署会把请求打到前端自身源上。
  await ensureRuntimeConfig();

  const token = readSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": resolveLocale(i18n.global.locale.value) === "en_US" ? "en-US" : "zh-CN",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(resolveApiUrl(url), {
    ...init,
    // A bearer deployment authenticates with the token and must not request
    // credentials (the backend answers with `Access-Control-Allow-Origin: *`).
    // A cookie deployment keeps sending them even when the API is cross-origin.
    credentials: init?.credentials ?? (requiresBearerToken() ? "omit" : "include"),
    headers,
    // A stalled API request must not leave admin pages in a permanent loading state.
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    let msg = res.statusText;
    let code = "";
    try {
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        errorCode?: string;
      };
      if (data.error) msg = data.error;
      else if (data.message) msg = data.message;
      code = data.errorCode ?? "";
    } catch {
      // Non-JSON error responses retain their HTTP status text.
    }

    if (msg === "setup_required") {
      msg = i18n.global.t("login.adminCredentialsMissing");
    }

    // A revoked session (password changed elsewhere, token expired) must drop
    // the local credential and bounce the user back to the login screen.
    if (res.status === 401 && !url.startsWith("/api/admin/login")) {
      clearSessionToken();
      emitUnauthorized();
    }

    throw new ApiError(msg, code);
  }
  // 204/空响应体没有 JSON 可解析，直接返回 undefined 交给调用方。
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  status: () => request<PacStatus>("/api/status"),
  session: async () => {
    const result = await request<AdminSession>("/api/admin/session");
    // The backend reports how it expects to be authenticated: cookie for a
    // same-origin deployment, bearer for a split one. Remember it so login knows
    // whether the returned token has to be persisted.
    bearerRequired = result.authMode ? result.authMode === "bearer" : isCrossOriginApi();
    // 服务端读取凭据时 Authorization 头优先于 Cookie：cookie 部署下残留的旧
    // bearer token（此前跨域部署或旧会话密钥签发）会让每个请求被判为未登录，
    // 即使有效 Cookie 在场。cookie 模式必须清掉它。
    if (!bearerRequired) clearSessionToken();
    return result;
  },
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>("/api/admin/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: async (password: string) => {
    const result = await request<{ ok: boolean; token?: string; expiresAt?: number }>(
      "/api/admin/login",
      { method: "POST", body: JSON.stringify({ password }) }
    );
    // Only a bearer deployment needs the token in storage; a same-origin one is
    // already authenticated by the HttpOnly session cookie — and any stale
    // stored token would override that cookie server-side, so drop it.
    if (requiresBearerToken()) saveSessionToken(result.token, result.expiresAt);
    else clearSessionToken();
    return result;
  },
  logout: async () => {
    try {
      return await request<{ ok: boolean }>("/api/admin/logout", { method: "POST" });
    } finally {
      clearSessionToken();
    }
  },
  settings: () => request<AppSettings>("/api/admin/settings"),
  saveSettings: (body: AppSettings) =>
    request<AppSettings>("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  saveAndGenerate: (body: AppSettings) =>
    request<SaveAndGenerateResult>("/api/admin/settings/save-and-generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  notifications: () =>
    request<{
      channels: NotificationChannel[];
      rules: NotificationRule[];
      events: DomainEvent[];
      deliveries: NotificationDelivery[];
      eventCatalog: NotificationEventDefinition[];
    }>("/api/admin/notifications"),
  createNotificationChannel: (body: Partial<NotificationChannel>) =>
    request<NotificationChannel>("/api/admin/notifications/channels", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNotificationChannel: (id: string, body: Partial<NotificationChannel>) =>
    request<NotificationChannel>("/api/admin/notifications/channels/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNotificationChannel: (id: string) =>
    request<{ ok: boolean }>("/api/admin/notifications/channels/" + encodeURIComponent(id), {
      method: "DELETE",
    }),
  testNotificationChannel: (id: string) =>
    request<WebhookTestResult>(
      "/api/admin/notifications/channels/" + encodeURIComponent(id) + "/test",
      { method: "POST" }
    ),
  createNotificationRule: (body: Partial<NotificationRule>) =>
    request<NotificationRule>("/api/admin/notifications/rules", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNotificationRule: (id: string, body: Partial<NotificationRule>) =>
    request<NotificationRule>("/api/admin/notifications/rules/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNotificationRule: (id: string) =>
    request<{ ok: boolean }>("/api/admin/notifications/rules/" + encodeURIComponent(id), {
      method: "DELETE",
    }),
  retryNotificationDelivery: (id: string) =>
    request<{ ok: boolean }>(
      "/api/admin/notifications/deliveries/" + encodeURIComponent(id) + "/retry",
      { method: "POST" }
    ),
  generate: () => request<GenerateStartResult>("/api/admin/generate", { method: "POST" }),
  workflows: (limit = 50, beforeId = 0) =>
    request<WorkflowList>(`/api/admin/workflows?limit=${limit}&beforeId=${beforeId}`),
  workflowDetail: (id: number) => request<WorkflowDetail>(`/api/admin/workflows/${id}`),
  cancelWorkflow: (id: number) =>
    request<{ ok: boolean; id: number; status: "cancelled" }>(`/api/admin/workflows/${id}/cancel`, {
      method: "POST",
    }),
  storage: () => request<StorageSummary>("/api/admin/storage"),
  clearPacCache: () =>
    request<{ ok: boolean; deleted: string[] }>("/api/admin/pac-cache", { method: "DELETE" }),
  cleanupLogs: () =>
    request<{ deleted: { accessEvents: number; workflowRuns: number } }>(
      "/api/admin/logs/cleanup",
      { method: "POST" }
    ),
  clearLogs: () =>
    request<{ deleted: { accessEvents: number; workflowRuns: number } }>("/api/admin/logs/clear", {
      method: "POST",
    }),
  factoryReset: () =>
    request<{ ok: boolean; message: string }>("/api/admin/factory-reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESET" }),
    }),
  pacpilotStatus: () => request<PacPilotProbe>("/api/admin/pacpilot-status"),
  monitorSummary: () => request<MonitorSummary>("/api/admin/monitor/summary"),
  monitorAccessPage: (limit = 50, beforeId = 0) =>
    request<PagedResult<AccessEvent>>(
      `/api/admin/monitor/access?paged=1&limit=${limit}&beforeId=${beforeId}`
    ),
};
