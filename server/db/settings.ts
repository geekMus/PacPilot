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

export const DEFAULT_TASK_BODY = JSON.stringify({
  ok: "{{ok}}",
  event: "{{event}}",
  message: "{{message}}",
  timestamp: "{{timestamp}}",
}, null, 2);
export const DEFAULT_TASK_MESSAGE_TEMPLATE = "genpac-runner 通知\n事件：{{event}}\n状态：{{status}}\n时间：{{timestamp}}\n详情：{{message}}";
export const DEFAULT_TEST_MESSAGE_TEMPLATE = "genpac-runner 测试通知\n时间：{{timestamp}}\n结果：{{message}}";
export const DEFAULT_TEST_BODY = DEFAULT_TASK_BODY;

export function createDefaultWebhookConfig(): WebhookConfig {
  return {
    provider: "custom",
    url: "",
    method: "POST",
    headers: "{}",
    body: "",
    dingTalkSecret: "",
    dingTalkMessageType: "text",
    testBody: DEFAULT_TEST_BODY,
    messageTemplate: DEFAULT_TASK_MESSAGE_TEMPLATE,
    testMessageTemplate: DEFAULT_TEST_MESSAGE_TEMPLATE,
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
  /** HTTPS URL requested through each proxy during connectivity checks. */
  proxyTestUrl: string;
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
  listUrl: "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt",
  blockList: [],
  directList: [],
  cronSchedule: "",
  timezone: "Asia/Shanghai",
  proxyTestUrl: "https://www.google.com/generate_204",
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
  webhookSuccessConfig: { ...DEFAULT_WEBHOOK },
  webhookFailureConfig: { ...DEFAULT_WEBHOOK },
};
