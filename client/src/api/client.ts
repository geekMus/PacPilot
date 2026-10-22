import { i18n, resolveLocale } from "@/i18n";
import type {
  AppSettings,
  WebhookConfig,
  WorkflowRun,
  WorkflowStage,
  WorkflowStatus,
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
} from "@shared/contracts";

export interface Meta {
  adminEnabled: boolean;
  version: string;
  repositoryUrl: string;
}

export interface AdminSession {
  loggedIn: boolean;
  adminCredentialsMissing: boolean;
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

export interface GenerationLog {
  id: number;
  success: boolean;
  mode: string;
  result_code: string;
  detail: Record<string, string | number | boolean>;
  error: string;
  created_at: string;
}
export interface GenerateResult {
  workflowId?: number;
  success: boolean;
  mode: string;
  message: string;
  resultCode: string;
  pacPath: string;
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
export interface PacFileStatus {
  exists: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
}
export interface StorageSummary {
  dataBytes: number;
  dbBytes: number;
  logBytes: number;
  retentionDays: number;
  counts: {
    generationLogs: number;
    accessEvents: number;
    workflows: number;
    activeWorkflows: number;
  };
  pacFiles: { proxyPac: PacFileStatus; proxySourcePac: PacFileStatus };
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
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": resolveLocale(i18n.global.locale.value) === "en_US" ? "en-US" : "zh-CN",
      ...(init?.headers || {}),
    },
    ...init,
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
  login: (password: string) =>
    request<{ ok: boolean }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
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
  testWebhook: (body: { config: WebhookConfig }) =>
    request<WebhookTestResult>("/api/admin/webhook-test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generate: () => request<GenerateStartResult>("/api/admin/generate", { method: "POST" }),
  logs: () => request<GenerationLog[]>("/api/admin/logs"),
  logsPage: (limit = 50, beforeId = 0) =>
    request<PagedResult<GenerationLog>>(`/api/admin/logs/page?limit=${limit}&beforeId=${beforeId}`),
  workflows: (limit = 50, beforeId = 0) =>
    request<WorkflowList>(`/api/admin/workflows?limit=${limit}&beforeId=${beforeId}`),
  clearWorkflowHistory: () =>
    request<{ ok: boolean; deletedRuns: number }>("/api/admin/workflows", { method: "DELETE" }),
  workflowDetail: (id: number) => request<WorkflowDetail>(`/api/admin/workflows/${id}`),
  deleteWorkflow: (id: number) =>
    request<{ ok: boolean; id: number }>(`/api/admin/workflows/${id}`, { method: "DELETE" }),
  cancelWorkflow: (id: number) =>
    request<{ ok: boolean; id: number; status: "cancelled" }>(`/api/admin/workflows/${id}/cancel`, {
      method: "POST",
    }),
  storage: () => request<StorageSummary>("/api/admin/storage"),
  deletePacFiles: () =>
    request<{ ok: boolean; deleted: string[]; pacFiles: StorageSummary["pacFiles"] }>(
      "/api/admin/pac-files",
      { method: "DELETE" }
    ),
  cleanupLogs: () =>
    request<{
      deleted: { generationLogs: number; accessEvents: number };
      retentionDays: number;
    }>("/api/admin/logs/cleanup", { method: "POST" }),
  clearLogs: () =>
    request<{
      deleted: { generationLogs: number; accessEvents: number };
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
