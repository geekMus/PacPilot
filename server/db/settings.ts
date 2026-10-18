/**
 * 业务配置模型（持久化到 SQLite）。
 * 通知端点按渠道分开存储，旧版 URL/Body 字段在读取时自动迁移。
 */
export type GenerationMode = "custom" | "remote";
export type WebhookProvider = "custom" | "dingtalk";
export type WebhookMethod = "POST" | "PUT" | "PATCH";
export type DingTalkMessageType = "text" | "markdown";

export interface WebhookConfig {
  provider: WebhookProvider;
  /** Generic Webhook URL or the complete DingTalk robot URL. */
  url: string;
  method: WebhookMethod;
  /** Custom Webhook only: a JSON object of string-valued headers. */
  headers: string;
  /** Custom Webhook only: raw JSON payload, supports {{event}} etc. */
  body: string;
  /** DingTalk robot signature secret (SEC...). Empty when signature is disabled. */
  dingTalkSecret: string;
  dingTalkMessageType: DingTalkMessageType;
  /** DingTalk text/Markdown template. */
  messageTemplate: string;
}

export function createDefaultWebhookConfig(): WebhookConfig {
  return {
    provider: "custom",
    url: "",
    method: "POST",
    headers: "{}",
    body: "",
    dingTalkSecret: "",
    dingTalkMessageType: "text",
    messageTemplate: "",
  };
}

export function normalizeWebhookConfig(
  input: unknown,
  legacyUrl = "",
  legacyBody = ""
): WebhookConfig {
  const defaults = createDefaultWebhookConfig();
  const raw = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  return {
    provider: raw.provider === "dingtalk" ? "dingtalk" : "custom",
    url: String(raw.url ?? legacyUrl).trim(),
    method: raw.method === "PUT" || raw.method === "PATCH" ? raw.method : "POST",
    headers: String(raw.headers ?? defaults.headers),
    body: String(raw.body ?? legacyBody),
    dingTalkSecret: String(raw.dingTalkSecret ?? ""),
    dingTalkMessageType: raw.dingTalkMessageType === "markdown" ? "markdown" : "text",
    messageTemplate: String(raw.messageTemplate ?? ""),
  };
}

export interface AppSettings {
  mode: GenerationMode;
  pacProxy: string;
  pacCompress: boolean;
  pacPrecise: boolean;
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  /** Legacy fields retained for smooth migration from earlier versions. */
  webhookSuccessUrl: string;
  webhookSuccessBody: string;
  webhookFailureUrl: string;
  webhookFailureBody: string;
  webhookSuccessConfig: WebhookConfig;
  webhookFailureConfig: WebhookConfig;
}

const DEFAULT_WEBHOOK = createDefaultWebhookConfig();

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "custom",
  pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
  pacCompress: true,
  pacPrecise: false,
  listUrl: "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt",
  blockList: [],
  directList: [],
  cronSchedule: "",
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
  webhookSuccessConfig: { ...DEFAULT_WEBHOOK },
  webhookFailureConfig: { ...DEFAULT_WEBHOOK },
};
