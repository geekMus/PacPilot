import type { AppSettings } from "../db/settings";

export async function notifyWebhook(
  url: string,
  body: string
): Promise<void> {
  if (!url) return;

  try {
    const payload = body?.trim() ? body : JSON.stringify({ ok: true });
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  } catch (err) {
    console.error("[webhook] notify failed:", err);
  }
}

export async function notifySuccess(settings: AppSettings): Promise<void> {
  await notifyWebhook(settings.webhookSuccessUrl, settings.webhookSuccessBody);
}

export async function notifyFailure(settings: AppSettings): Promise<void> {
  await notifyWebhook(settings.webhookFailureUrl, settings.webhookFailureBody);
}
