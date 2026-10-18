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

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checked: boolean;
  repositoryUrl: string;
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
  pacPrecise: boolean;
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  timezone: string;
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
  success: boolean;
  mode: string;
  message: string;
  pacPath: string;
}
export interface GenpacProbe {
  available: boolean;
  command?: string | null;
  engine?: string;
  detail: string;
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
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  checkForUpdates: () => request<UpdateInfo>("/api/meta/update"),
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
  testWebhook: (body: { config: WebhookConfig }) =>
    request<WebhookTestResult>("/api/admin/webhook-test", {
      method: "POST", body: JSON.stringify(body),
    }),
  generate: () => request<GenerateResult>("/api/admin/generate", { method: "POST" }),
  logs: () => request<GenerationLog[]>("/api/admin/logs"),
  genpacStatus: () => request<GenpacProbe>("/api/admin/genpac-status"),
};
