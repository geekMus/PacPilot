import { createHmac } from "node:crypto";
import type { WebhookConfig } from "../domain/settings";
import type { DomainEvent } from "../../shared/contracts";
import { createDefaultWebhookConfig, normalizeWebhookConfig } from "../domain/settings";
import { assertSafeHttpUrl } from "../utils/url-safety";
import { t } from "../../shared/i18n";
import type { AppLocale } from "../../shared/i18n/locale";

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
  ok: boolean | null;
  message: string;
  timestamp: string;
  status?: string;
}

function urlValidationError(raw: string, label: string, locale: AppLocale = "zh_CN"): string | null {
  const value = raw.trim();
  if (!value) return t(locale, "webhook.empty", { label });
  // Webhooks may target LAN services (ntfy, Home Assistant); still block loopback/metadata.
  return assertSafeHttpUrl(value, label, { allowPrivateHosts: true });
}

function parseJson(
  raw: string,
  label: string,
  allowArray = false,
  locale: AppLocale = "zh_CN"
): string | null {
  if (!raw.trim()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || (!allowArray && Array.isArray(value))) {
      return allowArray
        ? t(locale, "webhook.mustBeObjectOrArray", { label })
        : t(locale, "webhook.mustBeObject", { label });
    }
    return null;
  } catch {
    return t(locale, "webhook.invalidJson", { label });
  }
}

/** 保存设置或发送测试前的服务端校验，不能仅依赖前端表单。 */
export function validateWebhookConfig(
  input: WebhookConfig,
  locale: AppLocale = "zh_CN"
): string[] {
  const config = normalizeWebhookConfig(input);
  const errors: string[] = [];
  const urlError = urlValidationError(
    config.url,
    config.provider === "dingtalk" ? t(locale, "webhook.dingtalkUrl") : t(locale, "webhook.webhookUrl"),
    locale
  );
  if (urlError) errors.push(urlError);

  if (config.provider === "custom") {
    const bodyError = parseJson(config.body, t(locale, "webhook.body"), true, locale);
    if (bodyError) errors.push(bodyError);
    const testBodyError = parseJson(config.testBody, t(locale, "webhook.testBody"), true, locale);
    if (testBodyError) errors.push(testBodyError);
    const headersError = parseJson(config.headers, t(locale, "webhook.headers"), false, locale);
    if (headersError) errors.push(headersError);
    if (!headersError) {
      const headers = JSON.parse(config.headers || "{}") as Record<string, unknown>;
      for (const [name, value] of Object.entries(headers)) {
        if (!name.trim() || typeof value !== "string") {
          errors.push(t(locale, "webhook.headerNameValue"));
          break;
        }
        if (
          /^(host|content-length|connection|transfer-encoding|content-type)$/i.test(name) ||
          /[\r\n]/.test(value)
        ) {
          errors.push(t(locale, "webhook.headerTransport"));
          break;
        }
      }
    }
  } else if (!urlError) {
    // 钉钉未启用加签时不需要 Secret，access_token 仍必填。
    const target = new URL(config.url);
    if (!target.searchParams.has("access_token")) {
      errors.push(t(locale, "webhook.dingtalkToken"));
    }
  }
  return errors;
}

function buildContext(
  kind: EventKind,
  message?: string,
  timeZone = "Asia/Shanghai",
  locale: AppLocale = "zh_CN"
): MessageContext {
  const ok = kind === "success";
  return {
    event: kind === "test" ? "webhook.test" : ok ? "pac.generated" : "pac.generation_failed",
    ok: kind === "test" ? true : kind === "success",
    message:
      kind === "test"
        ? t(locale, "webhook.testTriggered")
        : message || (ok ? t(locale, "webhook.pacGenerated") : t(locale, "webhook.pacFailed")),
    timestamp: new Date().toLocaleString(locale === "en_US" ? "en-US" : "zh-CN", { timeZone }),
  };
}

function templateValues(context: MessageContext): Record<string, string> {
  return {
    event: context.event,
    status:
      context.status ??
      (context.event === "webhook.test" ? "test" : context.ok ? "success" : "failure"),
    message: context.message,
    timestamp: context.timestamp,
    ok: context.ok === null ? "" : String(context.ok),
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
  status: number,
  locale: AppLocale = "zh_CN"
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
    return { success: true, status, message: t(locale, "webhook.accepted") };
  }
  return {
    success: false,
    status,
    message: apiMessage || t(locale, "webhook.httpStatus", { status: String(status) }),
  };
}

function requestFailure(
  error: unknown,
  provider: string,
  locale: AppLocale = "zh_CN"
): WebhookDeliveryResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    message: isRequestTimeout(error, message)
      ? t(locale, "webhook.timeout", { provider, seconds: WEBHOOK_TIMEOUT_MS / 1000 })
      : t(locale, "webhook.failed", { provider, message }),
  };
}

/**
 * 区分真正的超时与其它传输错误。Bun 的 AbortSignal.timeout 抛出的错误类型名
 * 不是 AbortError，且 message 只含域名，按字符串匹配会把它误报成普通失败。
 */
function isRequestTimeout(error: unknown, message: string): boolean {
  const lowered = message.toLowerCase();
  if (
    lowered.includes("timeout") ||
    lowered.includes("aborted") ||
    lowered.includes("timed out") ||
    lowered.includes("timedout")
  ) {
    return true;
  }
  const name = error instanceof Error ? error.name : String(error);
  return name === "TimeoutError" || name === "AbortError" || name === "AbortError [DOMException]";
}

async function sendCustom(
  config: WebhookConfig,
  context: MessageContext,
  locale: AppLocale = "zh_CN"
): Promise<WebhookDeliveryResult> {
  const errors = validateWebhookConfig(config, locale);
  if (errors.length) return { success: false, message: errors.join("\n") };
  try {
    const headers = JSON.parse(config.headers || "{}") as Record<string, string>;
    const defaults = createDefaultWebhookConfig(locale);
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
    const result = providerMessage(await readProviderResponse(response), response.status, locale);
    await response.body?.cancel().catch(() => undefined);
    return result;
  } catch (error) {
    return requestFailure(error, "Webhook", locale);
  }
}

async function sendDingTalk(
  config: WebhookConfig,
  context: MessageContext,
  locale: AppLocale = "zh_CN"
): Promise<WebhookDeliveryResult> {
  const errors = validateWebhookConfig(config, locale);
  if (errors.length) return { success: false, message: errors.join("\n") };

  const target = new URL(config.url);
  const secret = config.dingTalkSecret.trim();
  // 钉钉允许不启用加签；未配置密钥时不追加 timestamp/sign，否则会带上空密钥的无效签名。
  if (secret) {
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret)
      .update(timestamp + "\n" + secret, "utf8")
      .digest("base64");
    target.searchParams.set("timestamp", timestamp);
    target.searchParams.set("sign", signature);
  }

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
    const result = providerMessage(await readProviderResponse(response), response.status, locale);
    await response.body?.cancel().catch(() => undefined);
    return result;
  } catch (error) {
    return requestFailure(error, t(locale, "webhook.providerDingTalk"), locale);
  }
}

export async function sendWebhook(
  input: WebhookConfig,
  kind: EventKind,
  detail?: string,
  timeZone = "Asia/Shanghai",
  locale: AppLocale = "zh_CN"
): Promise<WebhookDeliveryResult> {
  const config = normalizeWebhookConfig(input);
  const context = buildContext(kind, detail, timeZone, locale);
  return config.provider === "dingtalk"
    ? sendDingTalk(config, context, locale)
    : sendCustom(config, context, locale);
}

export async function sendWebhookTest(
  config: WebhookConfig,
  timeZone = "Asia/Shanghai",
  locale: AppLocale = "zh_CN"
): Promise<WebhookDeliveryResult> {
  return sendWebhook(config, "test", undefined, timeZone, locale);
}

export async function sendWebhookForEvent(
  input: WebhookConfig,
  event: DomainEvent,
  timeZone = "Asia/Shanghai",
  locale: AppLocale = "zh_CN"
): Promise<WebhookDeliveryResult> {
  const config = normalizeWebhookConfig(input);
  const context: MessageContext = {
    event: event.type + "." + event.phase,
    ok: event.outcome == null ? null : event.outcome === "success",
    status: event.outcome || (event.phase === "started" ? "started" : "unknown"),
    message: event.summary || event.type + " " + event.phase,
    timestamp: new Date(event.occurredAt).toLocaleString(
      locale === "en_US" ? "en-US" : "zh-CN",
      { timeZone }
    ),
  };
  return config.provider === "dingtalk"
    ? sendDingTalk(config, context, locale)
    : sendCustom(config, context, locale);
}
