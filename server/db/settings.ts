import { t, type AppLocale } from "../../shared/i18n";
import type { AppSettings, GenerationMode, WebhookConfig } from "../../shared/contracts";
export type {
  AppSettings,
  DingTalkMessageType,
  GenerationMode,
  WebhookConfig,
  WebhookMethod,
  WebhookProvider,
} from "../../shared/contracts";
export type { AppLocale } from "../../shared/i18n";

/**
 * 业务配置模型（持久化到 SQLite）。
 * 通知端点按成功和失败渠道分开存储。
 */
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
  logRetentionDays: 30,
  webhookSuccessConfig: { ...DEFAULT_WEBHOOK },
  webhookFailureConfig: { ...DEFAULT_WEBHOOK },
};
