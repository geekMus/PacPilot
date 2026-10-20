import { t, type AppLocale } from "../../shared/i18n";
export type { AppLocale } from "../../shared/i18n";

/**
 * 业务配置模型（持久化到 SQLite）。
 * 通知端点按成功和失败渠道分开存储。
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
  /** DingTalk robot signature Secret. Required for DingTalk notifications. */
  dingTalkSecret: string;
  dingTalkMessageType: DingTalkMessageType;
  /** Custom Webhook test payload (JSON). */
  testBody: string;
  /** Task notification template for this success/failure channel. */
  messageTemplate: string;
  /** Test notification template, separate from task notifications. */
  testMessageTemplate: string;
}

export const DEFAULT_TASK_BODY = JSON.stringify(
  {
    ok: "{{ok}}",
    event: "{{event}}",
    message: "{{message}}",
    timestamp: "{{timestamp}}",
  },
  null,
  2
);
export const DEFAULT_TEST_BODY = DEFAULT_TASK_BODY;

export function createDefaultWebhookConfig(locale: AppLocale = "zh_CN"): WebhookConfig {
  return {
    provider: "custom",
    url: "",
    method: "POST",
    headers: "{}",
    body: "",
    dingTalkSecret: "",
    dingTalkMessageType: "text",
    testBody: DEFAULT_TEST_BODY,
    messageTemplate: t(locale, "settings.defaultMessageTemplate"),
    testMessageTemplate: t(locale, "settings.testMessageTemplate"),
  };
}

export function normalizeWebhookConfig(input: unknown, locale: AppLocale = "zh_CN"): WebhookConfig {
  const defaults = createDefaultWebhookConfig(locale);
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    provider: raw.provider === "dingtalk" ? "dingtalk" : "custom",
    url: String(raw.url ?? "").trim(),
    method: raw.method === "PUT" || raw.method === "PATCH" ? raw.method : "POST",
    headers: String(raw.headers ?? defaults.headers),
    body: String(raw.body ?? ""),
    dingTalkSecret: String(raw.dingTalkSecret ?? ""),
    dingTalkMessageType: raw.dingTalkMessageType === "markdown" ? "markdown" : "text",
    testBody: String(raw.testBody ?? defaults.testBody),
    messageTemplate: String(raw.messageTemplate || defaults.messageTemplate),
    testMessageTemplate: String(raw.testMessageTemplate || defaults.testMessageTemplate),
  };
}

export interface AppSettings {
  mode: GenerationMode;
  pacProxy: string;
  pacCompress: boolean;
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  /** IANA timezone used by scheduled tasks and displayed timestamps. */
  timezone: string;
  /** Language used by the admin UI and generated PAC comments. */
  locale: AppLocale;
  /** HTTPS URL requested through each proxy during connectivity checks. */
  proxyTestUrl: string;
  /** Automatically delete operational logs older than this many days; 0 disables automatic cleanup. */
  logRetentionDays: number;
  webhookSuccessConfig: WebhookConfig;
  webhookFailureConfig: WebhookConfig;
}

const DEFAULT_WEBHOOK = createDefaultWebhookConfig();

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "custom",
  pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
  pacCompress: true,
  listUrl: "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt",
  blockList: [],
  directList: [],
  cronSchedule: "",
  timezone: "Asia/Shanghai",
  locale: "zh_CN",
  proxyTestUrl: "https://www.google.com/generate_204",
  logRetentionDays: 30,
  webhookSuccessConfig: { ...DEFAULT_WEBHOOK },
  webhookFailureConfig: { ...DEFAULT_WEBHOOK },
};
