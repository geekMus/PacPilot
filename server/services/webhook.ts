import type { AppSettings } from "../db/settings";

const WEBHOOK_TIMEOUT_MS = 10_000;
type JsonPayload = Record<string, unknown> | unknown[];

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

async function notifyWebhook(url: string, body: string, fallbackPayload: JsonPayload): Promise<void> {
  const endpoint = url.trim();
  if (!endpoint) return;
  try {
    const target = new URL(endpoint);
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Webhook URL must use HTTP or HTTPS");
    const payload = body.trim() ? body : JSON.stringify(fallbackPayload);
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) console.warn(`[webhook] endpoint returned HTTP ${response.status}`);
    else console.info(`[webhook] delivered (HTTP ${response.status})`);
    await response.body?.cancel().catch(() => undefined);
  } catch (err) {
    console.error("[webhook] notification failed:", err);
  }
}

/** 自定义内容按 JSON 原文发送；留空时使用默认事件载荷。 */
export async function notifySuccess(settings: AppSettings): Promise<void> {
  await notifyWebhook(settings.webhookSuccessUrl, settings.webhookSuccessBody, { ok: true });
}
export async function notifyFailure(settings: AppSettings): Promise<void> {
  await notifyWebhook(settings.webhookFailureUrl, settings.webhookFailureBody, { ok: false });
}
