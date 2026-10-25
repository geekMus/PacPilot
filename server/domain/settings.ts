import { t, type AppLocale } from "../../shared/i18n";
import { DEFAULT_LIST_URL } from "../../shared/contracts";
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

/** Domain settings defaults and normalization shared by every storage adapter. */
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

function normalizeDefaultTemplate(value: unknown, defaultValue: string): string {
  const template = String(value ?? "");
  // Older settings stored the built-in template as a value; treat it as unset so the UI can show it as a placeholder.
  return template === defaultValue ? "" : template;
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
    messageTemplate: normalizeDefaultTemplate(raw.messageTemplate, defaults.messageTemplate),
    testMessageTemplate: normalizeDefaultTemplate(
      raw.testMessageTemplate,
      defaults.testMessageTemplate
    ),
  };
}

const DEFAULT_WEBHOOK = createDefaultWebhookConfig();

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "custom",
  pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
  pacCompress: true,
  listUrl: DEFAULT_LIST_URL,
  blockList: [],
  directList: [],
  cronSchedule: "",
  timezone: "Asia/Shanghai",
  logRetentionDays: 30,
  webhookSuccessConfig: { ...DEFAULT_WEBHOOK },
  webhookFailureConfig: { ...DEFAULT_WEBHOOK },
};

function normalizeTimeZone(value: unknown): string {
  const timezone = String(value ?? DEFAULT_SETTINGS.timezone).trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_SETTINGS.timezone;
  }
}

/** Normalizes persisted and incoming settings identically for every storage adapter. */
export function normalizeAppSettings(input: unknown): AppSettings {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Partial<AppSettings>)
      : {};
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  return {
    ...merged,
    mode: merged.mode === "remote" ? "remote" : "custom",
    pacProxy: String(merged.pacProxy || DEFAULT_SETTINGS.pacProxy).trim(),
    pacCompress: Boolean(merged.pacCompress),
    listUrl: String(merged.listUrl || "").trim(),
    blockList: Array.isArray(merged.blockList)
      ? merged.blockList
          .map(String)
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    directList: Array.isArray(merged.directList)
      ? merged.directList
          .map(String)
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    cronSchedule: String(merged.cronSchedule || "").trim(),
    timezone: normalizeTimeZone(merged.timezone || DEFAULT_SETTINGS.timezone),
    logRetentionDays: Math.max(
      0,
      Math.min(
        3650,
        Math.floor(Number(merged.logRetentionDays ?? DEFAULT_SETTINGS.logRetentionDays) || 0)
      )
    ),
    webhookSuccessConfig: normalizeWebhookConfig(merged.webhookSuccessConfig),
    webhookFailureConfig: normalizeWebhookConfig(merged.webhookFailureConfig),
  };
}
