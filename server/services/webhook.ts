import type { AppSettings } from "../db/settings";

const WEBHOOK_TIMEOUT_MS = 10_000;
type JsonPayload = Record<string, unknown> | unknown[];

export interface WebhookDeliveryResult {
  success: boolean;
  status?: number;
  message: string;
}

function urlValidationError(raw: string, label: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return `${label}必须使用 http:// 或 https:// 地址。`;
    if (!url.hostname) return `${label}缺少有效主机名。`;
    if (url.username || url.password) return `${label}不应在 URL 中包含用户名或密码。`;
    return null;
  } catch {
    return `${label}格式无效，请填写完整的 HTTP(S) URL。`;
  }
}

/** 配置保存时进行服务端校验，避免绕过前端直接提交无效设置。 */
export function validateWebhookSettings(
  settings: Pick<AppSettings, "webhookSuccessUrl" | "webhookSuccessBody" | "webhookFailureUrl" | "webhookFailureBody">
): string[] {
  const errors: string[] = [];
  const successUrl = settings.webhookSuccessUrl.trim();
  const failureUrl = settings.webhookFailureUrl.trim();
  const successUrlError = urlValidationError(successUrl, "成功 Webhook URL");
  if (successUrlError) errors.push(successUrlError);
  const failureUrlError = urlValidationError(failureUrl, "失败 Webhook URL");
  if (failureUrlError) errors.push(failureUrlError);

  const validateBody = (raw: string, label: string, enabled: boolean) => {
    if (!enabled || !raw.trim()) return;
    try {
      const value: unknown = JSON.parse(raw);
      if (value === null || typeof value !== "object") errors.push(`${label}必须是 JSON 对象或数组。`);
    } catch {
      errors.push(`${label}格式无效，请检查 JSON 语法。`);
    }
  };
  validateBody(settings.webhookSuccessBody, "成功 Webhook Body", Boolean(successUrl));
  validateBody(settings.webhookFailureBody, "失败 Webhook Body", Boolean(failureUrl));
  return errors;
}

async function postWebhook(
  url: string,
  body: string,
  fallbackPayload: JsonPayload
): Promise<WebhookDeliveryResult> {
  const endpoint = url.trim();
  if (!endpoint) return { success: false, message: "Webhook URL 不能为空。" };

  const urlError = urlValidationError(endpoint, "Webhook URL");
  if (urlError) return { success: false, message: urlError };

  if (body.trim()) {
    try {
      const value: unknown = JSON.parse(body);
      if (value === null || typeof value !== "object") {
        return { success: false, message: "Webhook Body 顶层必须是 JSON 对象或数组。" };
      }
    } catch {
      return { success: false, message: "Webhook Body 不是合法 JSON。" };
    }
  }

  try {
    const payload = body.trim() ? body : JSON.stringify(fallbackPayload);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    const result: WebhookDeliveryResult = response.ok
      ? { success: true, status: response.status, message: "目标端点已接受请求。" }
      : { success: false, status: response.status, message: `目标端点返回 HTTP ${response.status}。` };
    await response.body?.cancel().catch(() => undefined);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: message.toLowerCase().includes("timeout") || message.toLowerCase().includes("aborted")
        ? "请求超时（10 秒）或被目标端点中断。"
        : `请求失败：${message}`,
    };
  }
}

async function notifyWebhook(url: string, body: string, fallbackPayload: JsonPayload): Promise<void> {
  if (!url.trim()) return;
  const result = await postWebhook(url, body, fallbackPayload);
  if (!result.success) console.error(`[webhook] ${result.message}`);
  else console.info(`[webhook] delivered (HTTP ${result.status})`);
}

/** 测试请求复用真实发送流程；Body 留空时发送独立的测试事件。 */
export async function sendWebhookTest(url: string, body: string): Promise<WebhookDeliveryResult> {
  return postWebhook(url, body, { ok: true, test: true, event: "webhook.test" });
}

export async function notifySuccess(settings: AppSettings): Promise<void> {
  await notifyWebhook(settings.webhookSuccessUrl, settings.webhookSuccessBody, { ok: true });
}
export async function notifyFailure(settings: AppSettings): Promise<void> {
  await notifyWebhook(settings.webhookFailureUrl, settings.webhookFailureBody, { ok: false });
}
