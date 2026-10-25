import { randomUUID } from "node:crypto";
import type {
  DomainEvent,
  NotificationChannel,
  NotificationDelivery,
  NotificationDocument,
  NotificationEventDefinition,
  NotificationEventPhase,
  NotificationOutcome,
  NotificationRule,
  WebhookConfig,
} from "../../shared/contracts";
import type { ApplicationStorage } from "../storage/repositories";
import { normalizeWebhookConfig } from "../domain/settings";
import { sendWebhookForEvent, sendWebhookTest, validateWebhookConfig } from "./webhook";
import { runtimeLog } from "../utils/runtime-log";

const MAX_EVENTS = 200;
const MAX_DELIVERIES = 500;
const MAX_ATTEMPTS = 3;
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const locks = new WeakMap<object, Promise<void>>();
const activeDeliveries = new Set<string>();

export const notificationEventCatalog: NotificationEventDefinition[] = [
  {
    type: "task.execution",
    label: "任务执行",
    phases: ["started", "finished"],
    outcomes: ["success", "failure", "cancelled", "timeout", "unknown"],
    subjectTypes: ["task"],
  },
  {
    type: "config.publish",
    label: "配置发布",
    phases: ["started", "finished", "state_changed"],
    outcomes: ["success", "failure", "unknown"],
    subjectTypes: ["configuration"],
  },
  {
    type: "request.process",
    label: "请求处理",
    phases: ["started", "finished"],
    outcomes: ["success", "failure", "timeout", "unknown"],
    subjectTypes: ["request"],
  },
  {
    type: "system.error",
    label: "系统异常",
    phases: ["state_changed"],
    outcomes: ["failure", "unknown"],
    subjectTypes: ["system"],
  },
];
async function withLock<T>(storage: ApplicationStorage, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(storage) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(storage, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(storage) === current) locks.delete(storage);
  }
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|sign|authorization/i.test(key)) url.searchParams.set(key, "***");
    }
    return url.toString();
  } catch {
    return raw;
  }
}
function redactHeaders(raw: string): string {
  // 空值保持空串返回：否则会被序列化成 "{}"，编辑表单把它当成已填写的内容展示。
  if (!raw.trim()) return "";
  try {
    const headers = JSON.parse(raw) as Record<string, string>;
    for (const key of Object.keys(headers)) {
      if (/authorization|token|secret|api[_-]?key|signature/i.test(key)) headers[key] = "***";
    }
    return JSON.stringify(headers, null, 2);
  } catch {
    return raw;
  }
}
function publicChannel(channel: NotificationChannel): NotificationChannel {
  return {
    ...channel,
    config: {
      ...channel.config,
      url: redactUrl(channel.config.url),
      headers: redactHeaders(channel.config.headers),
      dingTalkSecret: "",
    },
    hasSecret: Boolean(
      channel.config.dingTalkSecret ||
      /(?:token|secret|key|sign)=/i.test(channel.config.url) ||
      /authorization|token|secret|api[_-]?key|signature/i.test(channel.config.headers)
    ),
  };
}
function mergeSecrets(input: WebhookConfig, previous?: WebhookConfig): WebhookConfig {
  const config = normalizeWebhookConfig(input);
  if (!previous) return config;
  if (redactUrl(previous.url) === config.url) config.url = previous.url;
  if (!config.dingTalkSecret.trim()) config.dingTalkSecret = previous.dingTalkSecret;
  if (config.provider !== "dingtalk") config.dingTalkSecret = "";
  try {
    const oldHeaders = JSON.parse(previous.headers || "{}") as Record<string, string>;
    const newHeaders = JSON.parse(config.headers || "{}") as Record<string, string>;
    for (const [key, value] of Object.entries(newHeaders)) {
      if (value === "***" && oldHeaders[key]) newHeaders[key] = oldHeaders[key];
    }
    config.headers = JSON.stringify(newHeaders, null, 2);
  } catch {
    /* server validation handles malformed header JSON */
  }
  return config;
}

async function loadUnlocked(storage: ApplicationStorage): Promise<NotificationDocument> {
  return await storage.notifications.get();
}

export async function getNotificationAdminView(storage: ApplicationStorage) {
  return withLock(storage, async () => {
    const document = await loadUnlocked(storage);
    return {
      channels: document.channels.map(publicChannel),
      rules: document.rules,
      events: document.events,
      deliveries: document.deliveries,
      eventCatalog: notificationEventCatalog,
    };
  });
}
export function validateRule(input: Partial<NotificationRule>): string | null {
  if (!input.name?.trim()) return "规则名称不能为空。";
  const definition = notificationEventCatalog.find((item) => item.type === input.eventType);
  if (!definition) return "不支持的事件类型。";
  if (!definition.phases.includes(input.phase as NotificationEventPhase))
    return "该事件类型不支持所选阶段。";
  if (
    (input.phase === "started" || input.phase === "progress") &&
    input.outcome != null &&
    input.outcome !== "any"
  ) {
    return "开始或执行中阶段没有最终结果，请选择不限制结果。";
  }
  if (
    input.outcome != null &&
    input.outcome !== "any" &&
    !definition.outcomes.includes(input.outcome as NotificationOutcome)
  ) {
    return "该事件类型不支持所选结果。";
  }
  if (
    !Array.isArray(input.channelIds) ||
    input.channelIds.length === 0 ||
    input.channelIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    return "至少选择一个通知渠道。";
  }
  return null;
}
export async function saveNotificationChannel(
  storage: ApplicationStorage,
  input: Partial<NotificationChannel>,
  id?: string
) {
  return withLock(storage, async () => {
    const document = await loadUnlocked(storage);
    const previous = id ? document.channels.find((channel) => channel.id === id) : undefined;
    if (id && !previous) throw new Error("通知渠道不存在。");
    const config = mergeSecrets((input.config || {}) as WebhookConfig, previous?.config);
    const errors = validateWebhookConfig(config);
    if (config.url.trim() && errors.length) throw new Error(errors.join("\n"));
    if (!input.name?.trim()) throw new Error("通知渠道名称不能为空。");
    const timestamp = now();
    const channel: NotificationChannel = {
      id: previous?.id || randomUUID(),
      name: input.name.trim(),
      provider: config.provider,
      enabled: input.enabled !== false,
      config,
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (previous)
      document.channels = document.channels.map((item) => (item.id === id ? channel : item));
    else document.channels.push(channel);
    await storage.notifications.set(document);
    return publicChannel(channel);
  });
}
export async function removeNotificationChannel(storage: ApplicationStorage, id: string) {
  return withLock(storage, async () => {
    const document = await loadUnlocked(storage);
    if (!document.channels.some((channel) => channel.id === id))
      throw new Error("通知渠道不存在。");
    if (document.rules.some((rule) => rule.channelIds.includes(id)))
      throw new Error("该渠道仍被通知规则引用，请先修改或删除相关规则。");
    document.channels = document.channels.filter((channel) => channel.id !== id);
    await storage.notifications.set(document);
  });
}
export async function saveNotificationRule(
  storage: ApplicationStorage,
  input: Partial<NotificationRule>,
  id?: string
) {
  return withLock(storage, async () => {
    const document = await loadUnlocked(storage);
    const previous = id ? document.rules.find((rule) => rule.id === id) : undefined;
    if (id && !previous) throw new Error("通知规则不存在。");
    const validationError = validateRule(input);
    if (validationError) throw new Error(validationError);
    for (const channelId of input.channelIds!) {
      if (!document.channels.some((channel) => channel.id === channelId))
        throw new Error("规则引用了不存在的通知渠道。");
    }
    const timestamp = now();
    const rule: NotificationRule = {
      id: previous?.id || randomUUID(),
      name: input.name!.trim(),
      enabled: input.enabled !== false,
      eventType: input.eventType!,
      phase: input.phase!,
      outcome: input.outcome ?? null,
      channelIds: [...new Set(input.channelIds!)],
      subjectType: input.subjectType?.trim() || undefined,
      createdAt: previous?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (previous) document.rules = document.rules.map((item) => (item.id === id ? rule : item));
    else document.rules.push(rule);
    await storage.notifications.set(document);
    return rule;
  });
}
export async function removeNotificationRule(storage: ApplicationStorage, id: string) {
  return withLock(storage, async () => {
    const document = await loadUnlocked(storage);
    if (!document.rules.some((rule) => rule.id === id)) throw new Error("通知规则不存在。");
    document.rules = document.rules.filter((rule) => rule.id !== id);
    await storage.notifications.set(document);
  });
}
function matches(rule: NotificationRule, event: DomainEvent) {
  return (
    rule.enabled &&
    rule.eventType === event.type &&
    rule.phase === event.phase &&
    (rule.outcome == null || rule.outcome === "any" || rule.outcome === event.outcome) &&
    (!rule.subjectType || rule.subjectType === event.subject.type)
  );
}
function safeError(error: unknown, channel: NotificationChannel): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [channel.config.url, channel.config.dingTalkSecret]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.replace(/https?:\/\/[^\s]+/g, (url) => redactUrl(url)).slice(0, 1000);
}

async function updateDelivery(
  storage: ApplicationStorage,
  id: string,
  update: (delivery: NotificationDelivery, document: NotificationDocument) => void
) {
  return withLock(storage, async () => {
    const document = await storage.notifications.get();
    const delivery = document.deliveries.find((item) => item.id === id);
    if (!delivery) return null;
    update(delivery, document);
    await storage.notifications.set(document);
    return { delivery, document };
  });
}
async function deliver(
  storage: ApplicationStorage,
  event: DomainEvent,
  deliveryId: string,
  timeZone: string
) {
  const existing = await storage.notifications.get();
  const previousAttempts =
    existing.deliveries.find((item) => item.id === deliveryId)?.attemptCount ?? 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ready = await updateDelivery(storage, deliveryId, (delivery, document) => {
      const channel = document.channels.find(
        (item) => item.id === delivery.channelId && item.enabled
      );
      const rule = document.rules.find((item) => item.id === delivery.ruleId && item.enabled);
      if (!channel || !rule) {
        delivery.status = "failed";
        delivery.lastError = "通知规则或渠道已停用。";
        delivery.updatedAt = now();
        return;
      }
      delivery.status = "sending";
      delivery.attemptCount = previousAttempts + attempt;
      delivery.updatedAt = now();
    });
    if (!ready) return;
    const current = ready.document.deliveries.find((item) => item.id === deliveryId)!;
    if (current.status !== "sending") return;
    const channel = ready.document.channels.find((item) => item.id === current.channelId)!;
    let result: Awaited<ReturnType<typeof sendWebhookForEvent>> | null = null;
    let caught: unknown = null;
    try {
      result = await sendWebhookForEvent(channel.config, event, timeZone);
    } catch (error) {
      caught = error;
    }
    const message = result
      ? result.success
        ? ""
        : safeError(new Error(result.message), channel)
      : safeError(caught, channel);
    const permanent = Boolean(
      result?.status && result.status >= 400 && result.status < 500 && result.status !== 429
    );
    const finished = await updateDelivery(storage, deliveryId, (delivery) => {
      delivery.updatedAt = now();
      if (result?.success) {
        delivery.status = "succeeded";
        delivery.deliveredAt = now();
        delivery.lastError = undefined;
      } else {
        delivery.lastError = message || "通知发送失败。";
        if (permanent || attempt === MAX_ATTEMPTS) delivery.status = "failed";
        else delivery.status = "pending";
      }
    });
    if (!finished) return;
    if (finished.delivery.status === "succeeded") return;
    if (finished.delivery.status === "failed") {
      runtimeLog(
        "error",
        "Notification delivery failed (" +
          finished.delivery.channelId +
          "): " +
          finished.delivery.lastError
      );
      return;
    }
    await sleep(250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150));
  }
}
async function dispatchPending(storage: ApplicationStorage, ids: string[], timeZone: string) {
  for (const id of ids) {
    if (activeDeliveries.has(id)) continue;
    activeDeliveries.add(id);
    try {
      const document = await storage.notifications.get();
      const delivery = document.deliveries.find((item) => item.id === id);
      const event = delivery && document.events.find((item) => item.id === delivery.eventId);
      if (delivery && event && (delivery.status === "pending" || delivery.status === "sending")) {
        await deliver(storage, event, id, timeZone);
      }
    } catch (error) {
      runtimeLog("error", "Notification dispatch failed: ", error);
    } finally {
      activeDeliveries.delete(id);
    }
  }
}
export async function publishDomainEvent(
  storage: ApplicationStorage,
  input: Omit<DomainEvent, "id" | "occurredAt"> & {
    id?: string;
    occurredAt?: string;
  }
) {
  try {
    const result = await withLock(storage, async () => {
      const document = await loadUnlocked(storage);
      const summary = input.summary?.replace(/https?:\/\/[^\s]+/g, (url) => redactUrl(url));
      const event: DomainEvent = {
        ...input,
        summary,
        id: input.id || randomUUID(),
        occurredAt: input.occurredAt || now(),
      };
      document.events.push(event);
      document.events = document.events.slice(-MAX_EVENTS);
      const ids: string[] = [];
      for (const rule of document.rules.filter((candidate) => matches(candidate, event))) {
        for (const channelId of rule.channelIds) {
          const channel = document.channels.find(
            (candidate) => candidate.id === channelId && candidate.enabled
          );
          if (!channel) continue;
          const delivery: NotificationDelivery = {
            id: randomUUID(),
            eventId: event.id,
            ruleId: rule.id,
            channelId,
            status: "pending",
            attemptCount: 0,
            createdAt: now(),
            updatedAt: now(),
          };
          document.deliveries.push(delivery);
          ids.push(delivery.id);
        }
      }
      document.deliveries = document.deliveries.slice(-MAX_DELIVERIES);
      await storage.notifications.set(document);
      return {
        ids: ids.filter((id) => document.deliveries.some((delivery) => delivery.id === id)),
        event,
      };
    });
    const timeZone = (await storage.settings.get()).timezone;
    void dispatchPending(storage, result.ids, timeZone);
  } catch (error) {
    runtimeLog("error", "Failed to persist notification event: ", error);
  }
}
export async function testNotificationChannel(storage: ApplicationStorage, id: string) {
  const channel = await withLock(storage, async () => {
    const document = await loadUnlocked(storage);
    const item = document.channels.find((candidate) => candidate.id === id);
    return item ? structuredClone(item) : null;
  });
  if (!channel) throw new Error("通知渠道不存在。");
  if (!channel.enabled) throw new Error("请先启用通知渠道。");
  const errors = validateWebhookConfig(channel.config);
  if (errors.length) throw new Error(errors.join("\n"));
  return sendWebhookTest(channel.config, (await storage.settings.get()).timezone);
}
export async function retryNotificationDelivery(storage: ApplicationStorage, id: string) {
  const result = await withLock(storage, async () => {
    const document = await storage.notifications.get();
    const delivery = document.deliveries.find((item) => item.id === id);
    if (!delivery) throw new Error("投递记录不存在。");
    if (delivery.status === "sending") throw new Error("该通知正在发送，请稍后再试。");
    if (delivery.status !== "failed") throw new Error("只有失败的通知可以手动重试。");
    const event = document.events.find((item) => item.id === delivery.eventId);
    const channel = document.channels.find((item) => item.id === delivery.channelId);
    if (!event || !channel || !channel.enabled) throw new Error("事件或已启用的渠道不存在。");
    delivery.status = "pending";
    delivery.lastError = undefined;
    delivery.updatedAt = now();
    await storage.notifications.set(document);
    return { deliveryId: delivery.id };
  });
  const timeZone = (await storage.settings.get()).timezone;
  await dispatchPending(storage, [result.deliveryId], timeZone);
}
const recoveries = new WeakMap<object, Promise<void>>();
/** Resume persisted pending deliveries after a process restart; delivery is at-least-once. */
export function resumePendingNotificationDeliveries(storage: ApplicationStorage): Promise<void> {
  const previous = recoveries.get(storage);
  if (previous) return previous;
  const recovery = (async () => {
    try {
      const document = await withLock(storage, () => storage.notifications.get());
      const ids = document.deliveries
        .filter(
          (item) =>
            (item.status === "pending" || item.status === "sending") &&
            !activeDeliveries.has(item.id)
        )
        .map((item) => item.id);
      await dispatchPending(storage, ids, (await storage.settings.get()).timezone);
    } catch (error) {
      runtimeLog("error", "Failed to resume notification deliveries: ", error);
    } finally {
      recoveries.delete(storage);
    }
  })();
  recoveries.set(storage, recovery);
  return recovery;
}
