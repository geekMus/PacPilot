export interface Meta {
  adminEnabled: boolean;
  version: string;
  repositoryUrl: string;
}

export interface AdminSession {
  loggedIn: boolean;
  isDefaultPassword: boolean;
  mustChangePassword: boolean;
}

export type WebhookProvider = "custom" | "dingtalk";
export type WebhookMethod = "POST" | "PUT" | "PATCH";
export type DingTalkMessageType = "text" | "markdown";

export interface WebhookConfig {
  provider: WebhookProvider;
  url: string;
  method: WebhookMethod;
  headers: string;
  body: string;
  dingTalkSecret: string;
  dingTalkMessageType: DingTalkMessageType;
  testBody: string;
  messageTemplate: string;
  testMessageTemplate: string;
}

export interface PacStatus {
  mode: "custom" | "remote" | "custom_parse_error" | "other" | "empty";
  modeLabel: string;
  blockList: string[];
  directList: string[];
  pacProxy: string | null;
  remoteProxyList: string[];
  remoteDirectList: string[];
  remoteProxyCount: number;
  remoteDirectCount: number;
  notice: string;
  updatedAt: string;
  hasPac: boolean;
}

export interface AppSettings {
  mode: "custom" | "remote";
  pacProxy: string;
  pacCompress: boolean;
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  timezone: string;
  proxyTestUrl: string;
  logRetentionDays: number;
  webhookSuccessUrl: string;
  webhookSuccessBody: string;
  webhookFailureUrl: string;
  webhookFailureBody: string;
  webhookSuccessConfig: WebhookConfig;
  webhookFailureConfig: WebhookConfig;
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
  message: string | null;
  created_at: string;
}
export interface GenerateResult {
  workflowId?: number;
  success: boolean;
  mode: string;
  message: string;
  pacPath: string;
}

export interface SaveAndGenerateResult {
  settings: AppSettings;
  workflowId: number;
}
export interface GenerateStartResult {
  workflowId: number;
  status: "running";
}

export type WorkflowStatus = "pending" | "running" | "succeeded" | "failed";
export interface WorkflowRun {
  id: number;
  source: string;
  status: WorkflowStatus;
  stage: string;
  mode: string;
  message: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}
export interface WorkflowList { current: WorkflowRun | null; runs: WorkflowRun[]; }
export interface StorageSummary {
  dataBytes: number;
  dbBytes: number;
  logBytes: number;
  retentionDays: number;
  counts: { generationLogs: number; accessEvents: number; proxyProbeRuns: number; workflows: number };
}
export interface GenpacProbe {
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
}

export interface ProxyProbeResult {
  testedAt: string;
  proxyLabel: string;
  proxyHost: string;
  proxyPort: number;
  targetHost: string;
  success: boolean;
  tcpMs: number | null;
  handshakeMs: number | null;
  targetMs: number | null;
  httpStatus: number | null;
  phase: string;
  error: string;
  isLoopback: boolean;
}

export interface ProxyProbeBatch {
  targetUrl: string;
  targetHost: string;
  targetPort: number;
  results: ProxyProbeResult[];
  ignoredDirectEntries: number;
  parseWarnings: string[];
  limited: boolean;
}

export interface ProxyProbeRecord {
  id: number;
  tested_at: string;
  proxy_label: string;
  proxy_host: string;
  proxy_port: number;
  target_host: string;
  success: boolean;
  tcp_ms: number | null;
  handshake_ms: number | null;
  target_ms: number | null;
  http_status: number | null;
  phase: string;
  error: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error) msg = data.error;
      else if (data.message) msg = data.message;
    } catch { /* ignore non-JSON errors */ }

    // This endpoint was added with the server-side save-and-generate workflow.
    // A 404 means the browser is talking to an older backend process/build,
    // not that the submitted settings are invalid.
    if (res.status === 404 && url === "/api/admin/settings/save-and-generate") {
      msg = "当前后端未提供“保存并生成”接口，前后端代码版本可能不一致。请先停止所有旧的 genpac-runner 开发进程，更新到最新 main，再从项目根目录重新运行 bun run dev。检查终端中的后端监听端口，并确认 client/vite.config.ts 的代理目标 PORT 与后端 PORT 一致。此次请求未能完成保存与生成，请检查配置是否已保存后再重试。";
    }

    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  status: () => request<PacStatus>("/api/status"),
  session: () => request<AdminSession>("/api/admin/session"),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>("/api/admin/password", {
      method: "POST", body: JSON.stringify(body),
    }),
  login: (password: string) => request<{ ok: boolean }>("/api/admin/login", {
    method: "POST", body: JSON.stringify({ password }),
  }),
  logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
  settings: () => request<AppSettings>("/api/admin/settings"),
  saveSettings: (body: AppSettings) => request<AppSettings>("/api/admin/settings", {
    method: "PUT", body: JSON.stringify(body),
  }),
  saveAndGenerate: (body: AppSettings) => request<SaveAndGenerateResult>("/api/admin/settings/save-and-generate", {
    method: "POST", body: JSON.stringify(body),
  }),
  testWebhook: (body: { config: WebhookConfig }) =>
    request<WebhookTestResult>("/api/admin/webhook-test", {
      method: "POST", body: JSON.stringify(body),
    }),
  generate: () => request<GenerateStartResult>("/api/admin/generate", { method: "POST" }),
  logs: () => request<GenerationLog[]>("/api/admin/logs"),
  workflows: (limit = 50) => request<WorkflowList>(`/api/admin/workflows?limit=${limit}`),
  storage: () => request<StorageSummary>("/api/admin/storage"),
  cleanupLogs: () => request<{ deleted: { generationLogs: number; accessEvents: number; proxyProbeRuns: number }; retentionDays: number }>("/api/admin/logs/cleanup", { method: "POST" }),
  factoryReset: () => request<{ ok: boolean; message: string }>("/api/admin/factory-reset", { method: "POST" }),
  genpacStatus: () => request<GenpacProbe>("/api/admin/genpac-status"),
  monitorSummary: () => request<MonitorSummary>("/api/admin/monitor/summary"),
  monitorAccess: (limit = 50) => request<AccessEvent[]>(`/api/admin/monitor/access?limit=${limit}`),
  proxyProbeTarget: () => request<{ url: string }>("/api/admin/monitor/probe-target"),
  saveProxyProbeTarget: (url: string) => request<{ url: string }>("/api/admin/monitor/probe-target", {
    method: "PUT", body: JSON.stringify({ url }),
  }),
  testProxies: () => request<ProxyProbeBatch>("/api/admin/monitor/probe", {
    method: "POST", body: JSON.stringify({}),
  }),
  proxyProbeHistory: (limit = 30) => request<ProxyProbeRecord[]>(`/api/admin/monitor/probes?limit=${limit}`),
};
