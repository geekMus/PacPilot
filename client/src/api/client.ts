import { i18n, resolveLocale } from "@/i18n";
import { resolveApiUrl, isCrossOriginApi } from "@/api/runtime-config";
import { readSessionToken, saveSessionToken, clearSessionToken } from "@/api/session-token";
import { emitUnauthorized } from "@/api/auth-events";
import type {
  AppSettings,
  WebhookConfig,
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
  DingTalkMessageType,
  WebhookConfig,
  WebhookMethod,
  WebhookProvider,
  WorkflowRun,
  WorkflowStage,
  WorkflowStatus,
  NotificationChannel,
  NotificationRule,
  DomainEvent,
  NotificationDelivery,
  NotificationEventDefinition,
} from "@shared/contracts";

export interface Meta {
  adminEnabled: boolean;
  version: string;
  repositoryUrl: string;
  /** Backend storage driver; lets the UI show what actually stores the data. */
  storageDriver?: "sqlite" | "memory" | string;
  runtimeProfile?: string;
  mode?: "custom" | "remote";
  timezone?: string;
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

export interface GenerateResult {
  workflowId?: number;
  success: boolean;
  mode: string;
  message: string;
  resultCode: string;
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
  nextCursor: number | null;
  total: number;
  hasMore: boolean;
}
export interface WorkflowList {
  current: WorkflowRun | null;
  active: WorkflowRun[];
  runs: WorkflowRun[];
  beforeId?: number;
  nextCursor?: number | null;
  total?: number;
  hasMore?: boolean;
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
  retentionDays: number;
  counts: {
    accessEvents: number;
    workflows: number;
    activeWorkflows: number;
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
  errorRequestsLast24h: number;
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
    readonly code = "",
    readonly detail = ""
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = readSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": resolveLocale(i18n.global.locale.value) === "en_US" ? "en-US" : "zh-CN",
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(resolveApiUrl(url), {
    // Cross-origin deployments authenticate with the bearer token, and must not
    // request credentials (the backend answers with `Access-Control-Allow-Origin: *`).
    credentials: isCrossOriginApi() ? "omit" : "include",
    ...init,
    headers,
    // A stalled API request must not leave admin pages in a permanent loading state.
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    let msg = res.statusText;
    let code = "";
    let detail = "";
    try {
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        errorCode?: string;
        errorDetail?: string;
      };
      if (data.error) msg = data.error;
      else if (data.message) msg = data.message;
      code = data.errorCode ?? "";
      detail = data.errorDetail ?? "";
    } catch {
      // Non-JSON error responses retain their HTTP status text.
    }

    // This endpoint was added with the server-side save-and-generate workflow.
    // A 404 means the browser is talking to an older backend process/build,
    // not that the submitted settings are invalid.
    if (res.status === 404 && url === "/api/admin/settings/save-and-generate") {
      msg = i18n.global.t("serverErrors.versionMismatch");
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

    throw new ApiError(msg, code, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  status: () => request<PacStatus>("/api/status"),
  session: () => request<AdminSession>("/api/admin/session"),
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
    saveSessionToken(result.token, result.expiresAt);
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
  testWebhook: (body: { config: WebhookConfig }) =>
    request<WebhookTestResult>("/api/admin/webhook-test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generate: () => request<GenerateStartResult>("/api/admin/generate", { method: "POST" }),
  workflows: (limit = 50, beforeId = 0) =>
    request<WorkflowList>(`/api/admin/workflows?limit=${limit}&beforeId=${beforeId}`),
  workflowDetail: (id: number) => request<WorkflowDetail>(`/api/admin/workflows/${id}`),
  cancelWorkflow: (id: number) =>
    request<{ ok: boolean; id: number; status: "cancelled" }>(`/api/admin/workflows/${id}/cancel`, {
      method: "POST",
    }),
  storage: () => request<StorageSummary>("/api/admin/storage"),
  deletePacFiles: () =>
    request<{ ok: boolean; deleted: string[] }>("/api/admin/pac-files", { method: "DELETE" }),
  cleanupLogs: () =>
    request<{
      deleted: { accessEvents: number; workflowRuns: number };
      retentionDays: number;
    }>("/api/admin/logs/cleanup", { method: "POST" }),
  clearLogs: () =>
    request<{
      deleted: { accessEvents: number; workflowRuns: number };
      retentionDays: number;
    }>("/api/admin/logs/clear", { method: "POST" }),
  factoryReset: () =>
    request<{ ok: boolean; message: string }>("/api/admin/factory-reset", {
      method: "POST",
      body: JSON.stringify({ confirm: "RESET" }),
    }),
  pacpilotStatus: () => request<PacPilotProbe>("/api/admin/pacpilot-status"),
  monitorSummary: () => request<MonitorSummary>("/api/admin/monitor/summary"),
  monitorAccess: (limit = 50) => request<AccessEvent[]>(`/api/admin/monitor/access?limit=${limit}`),
  monitorAccessPage: (limit = 50, beforeId = 0) =>
    request<PagedResult<AccessEvent>>(
      `/api/admin/monitor/access?paged=1&limit=${limit}&beforeId=${beforeId}`
    ),
};
