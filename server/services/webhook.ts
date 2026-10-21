import { createHmac } from "node:crypto";
import type { AppSettings, WebhookConfig } from "../db/settings";
import { createDefaultWebhookConfig, normalizeWebhookConfig } from "../db/settings";
import { assertSafeHttpUrl } from "../utils/url-safety";
import { runtimeLog } from "../utils/runtime-log";

const WEBHOOK_TIMEOUT_MS = 10_000;
export interface WebhookDeliveryResult {
  success: boolean;
  status?: number;
  message: string;
  provider?: string;
  url?: string;
  duration_ms?: number;
}
type EventKind = "success" | "failure" | "test";
interface MessageContext {
  event: string;
  ok: boolean;
  message: string;
  timestamp: string;
}

function urlValidationError(raw: string, label: string): string | null {
  const value = raw.trim();
  if (!value) return label + "不能为空。";
  // Webhooks may target LAN services (ntfy, Home Assistant); still block loopback/metadata.
  return assertSafeHttpUrl(value, label, { allowPrivateHosts: true });
}

function parseJson(raw: string, label: string, allowArray = false): string | null {
  if (!raw.trim()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || (!allowArray && Array.isArray(value))) {
      return allowArray ? label + "必须是 JSON 对象或数组。" : label + "必须是 JSON 对象。";
    }
    return null;
  } catch {
    return label + "不是合法 JSON。";
  }
}

/** 保存设置或发送测试前的服务端校验，不能仅依赖前端表单。 */
export function validateWebhookConfig(input: WebhookConfig): string[] {
  const config = normalizeWebhookConfig(input);
  const errors: string[] = [];
  const urlError = urlValidationError(
    config.url,
    config.provider === "dingtalk" ? "钉钉机器人 URL" : "Webhook URL"
  );
  if (urlError) errors.push(urlError);

  if (config.provider === "custom") {
    const bodyError = parseJson(config.body, "Webhook Body", true);
    if (bodyError) errors.push(bodyError);
    const testBodyError = parseJson(config.testBody, "Webhook 测试 Body", true);
    if (testBodyError) errors.push(testBodyError);
    const headersError = parseJson(config.headers, "请求头");
    if (headersError) errors.push(headersError);
    if (!headersError) {
      const headers = JSON.parse(config.headers || "{}") as Record<string, unknown>;
      for (const [name, value] of Object.entries(headers)) {
        if (!name.trim() || typeof value !== "string") {
          errors.push("请求头需要使用“名称: 字符串值”的 JSON 对象。");
          break;
        }
        if (
          /^(host|content-length|connection|transfer-encoding|content-type)$/i.test(name) ||
          /[\r\n]/.test(value)
        ) {
          errors.push(
            "请求头包含不允许覆盖的传输字段或换行字符；Content-Type 固定为 application/json。"
          );
          break;
        }
      }
    }
  } else {
    if (!config.dingTalkSecret.trim()) {
      errors.push("钉钉机器人必须配置 Secret 加签密钥。");
    }
    if (!urlError) {
      const target = new URL(config.url);
      if (!target.searchParams.has("access_token")) {
        errors.push("钉钉机器人 URL 缺少 access_token，请粘贴完整的机器人 Webhook 地址。");
      }
    }
  }
  return errors;
}

function buildContext(
  kind: EventKind,
  message?: string,
  timeZone = "Asia/Shanghai"
): MessageContext {
  const ok = kind === "success";
  return {
    event: kind === "test" ? "webhook.test" : ok ? "pac.generated" : "pac.generation_failed",
    ok: kind === "test" ? true : kind === "success",
    message:
      kind === "test"
        ? "测试通知请求已触发。"
        : message || (ok ? "PAC 已成功生成。" : "PAC 生成失败。"),
    timestamp: new Date().toLocaleString("zh-CN", { timeZone }),
  };
}

function templateValues(context: MessageContext): Record<string, string> {
  return {
    event: context.event,
    status: context.event === "webhook.test" ? "test" : context.ok ? "success" : "failure",
    message: context.message,
    timestamp: context.timestamp,
    ok: String(context.ok),
  };
}

/** 通知模板中可用 {{event}}、{{status}}、{{message}}、{{timestamp}}、{{ok}}。 */
function renderMessage(template: string, context: MessageContext): string {
  const values = templateValues(context);
  return template.replace(
    /\{\{\s*(event|status|message|timestamp|ok)\s*\}\}/g,
    (_match, key: string) => values[key] ?? ""
  );
}

/** 自定义 JSON 请求体的模板变量需放在 JSON 字符串值中，以保留合法转义。 */
function renderCustomBody(template: string, context: MessageContext): string {
  const values = templateValues(context);
  return template.replace(
    /\{\{\s*(event|status|message|timestamp|ok)\s*\}\}/g,
    (_match, key: string) => JSON.stringify(values[key] ?? "").slice(1, -1)
  );
}

export function getNotificationConfig(
  settings: AppSettings,
  kind: "success" | "failure"
): WebhookConfig {
  return normalizeWebhookConfig(
    kind === "success" ? settings.webhookSuccessConfig : settings.webhookFailureConfig
  );
}

async function readProviderResponse(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function providerMessage(
  body: Record<string, unknown> | null,
  status: number
): WebhookDeliveryResult {
  const errcode = body?.errcode;
  const providerRejected = body?.ok === false || (errcode !== undefined && String(errcode) !== "0");
  const apiMessage =
    typeof body?.description === "string"
      ? body.description
      : typeof body?.errmsg === "string"
        ? body.errmsg
        : "";
  if (status >= 200 && status < 300 && !providerRejected) {
    return { success: true, status, message: "目标端点已接受请求。" };
  }
  return { success: false, status, message: apiMessage || "目标端点返回 HTTP " + status + "。" };
}

function requestFailure(error: unknown, provider: string): WebhookDeliveryResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    message:
      message.toLowerCase().includes("timeout") || message.toLowerCase().includes("aborted")
        ? provider + "请求超时（" + WEBHOOK_TIMEOUT_MS / 1000 + " 秒）。"
        : provider + "请求失败：" + message,
  };
}

async function sendCustom(
  config: WebhookConfig,
  context: MessageContext
): Promise<WebhookDeliveryResult> {
  const errors = validateWebhookConfig(config);
  if (errors.length) return { success: false, message: errors.join("\n") };
  try {
    const headers = JSON.parse(config.headers || "{}") as Record<string, string>;
    const defaults = createDefaultWebhookConfig();
    const configuredBody =
      context.event === "webhook.test"
        ? config.testBody.trim() || config.body.trim() || defaults.body || defaults.testBody
        : config.body.trim() || defaults.body || defaults.testBody;
    const payload = renderCustomBody(configuredBody, context);
    const response = await fetch(config.url.trim(), {
      method: config.method,
      headers: { "Content-Type": "application/json", ...headers },
      body: payload,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    const result = providerMessage(await readProviderResponse(response), response.status);
    await response.body?.cancel().catch(() => undefined);
    return result;
  } catch (error) {
    return requestFailure(error, "Webhook");
  }
}

async function sendDingTalk(
  config: WebhookConfig,
  context: MessageContext
): Promise<WebhookDeliveryResult> {
  const errors = validateWebhookConfig(config);
  if (errors.length) return { success: false, message: errors.join("\n") };

  const target = new URL(config.url);
  const secret = config.dingTalkSecret.trim();
  const timestamp = String(Date.now());
  const stringToSign = timestamp + "\n" + secret;
  const signature = createHmac("sha256", secret).update(stringToSign, "utf8").digest("base64");
  target.searchParams.set("timestamp", timestamp);
  target.searchParams.set("sign", signature);

  const defaults = createDefaultWebhookConfig();
  const template =
    context.event === "webhook.test"
      ? config.testMessageTemplate.trim() || defaults.testMessageTemplate
      : config.messageTemplate.trim() || defaults.messageTemplate;
  const content = renderMessage(template, context);
  const markdownTitle =
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 64) || context.event;
  const payload =
    config.dingTalkMessageType === "markdown"
      ? { msgtype: "markdown", markdown: { title: markdownTitle, text: content } }
      : { msgtype: "text", text: { content } };

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    const result = providerMessage(await readProviderResponse(response), response.status);
    await response.body?.cancel().catch(() => undefined);
    return result;
  } catch (error) {
    return requestFailure(error, "钉钉");
  }
}

export async function sendWebhook(
  input: WebhookConfig,
  kind: EventKind,
  detail?: string,
  timeZone = "Asia/Shanghai"
): Promise<WebhookDeliveryResult> {
  const config = normalizeWebhookConfig(input);
  const context = buildContext(kind, detail, timeZone);
  return config.provider === "dingtalk"
    ? sendDingTalk(config, context)
    : sendCustom(config, context);
}

export async function sendWebhookTest(
  config: WebhookConfig,
  timeZone = "Asia/Shanghai"
): Promise<WebhookDeliveryResult> {
  return sendWebhook(config, "test", undefined, timeZone);
}

async function notify(
  config: WebhookConfig,
  kind: "success" | "failure",
  message?: string,
  timeZone = "Asia/Shanghai"
): Promise<WebhookDeliveryResult | null> {
  if (!config.url.trim()) return null;
  const started = Date.now();
  const result = await sendWebhook(config, kind, message, timeZone);
  const enriched: WebhookDeliveryResult = {
    ...result,
    provider: config.provider,
    url: config.url.trim(),
    duration_ms: Math.max(0, Date.now() - started),
  };
  if (!enriched.success) {
    runtimeLog("error", `Webhook (${config.provider}) delivery failed: ${enriched.message}`);
  } else {
    runtimeLog("info", `Webhook (${config.provider}) delivered successfully (HTTP ${enriched.status})`);
  }
  return enriched;
}

export async function notifySuccess(settings: AppSettings): Promise<WebhookDeliveryResult | null> {
  return notify(
    getNotificationConfig(settings, "success"),
    "success",
    undefined,
    settings.timezone
  );
}
export async function notifyFailure(
  settings: AppSettings,
  message?: string
): Promise<WebhookDeliveryResult | null> {
  return notify(getNotificationConfig(settings, "failure"), "failure", message, settings.timezone);
}
