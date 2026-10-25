import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DomainEvent,
  NotificationChannel,
  NotificationDocument,
  NotificationRule,
  WebhookConfig,
} from "../../shared/contracts";
import { createDefaultWebhookConfig, normalizeWebhookConfig } from "../domain/settings";
import {
  notificationEventCatalog,
  publishDomainEvent,
  removeNotificationChannel,
  removeNotificationRule,
  resumePendingNotificationDeliveries,
  retryNotificationDelivery,
  saveNotificationChannel,
  saveNotificationRule,
  testNotificationChannel,
  validateRule,
} from "../services/notifications";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";

type Storage = ReturnType<typeof createMemoryApplicationStorage>;

function config(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return { ...createDefaultWebhookConfig(), url: "https://hooks.example.com/notify", ...overrides };
}

/** A channel draft as the admin UI sends it: provider, url and config only. */
function channelDraft(overrides: Partial<NotificationChannel> = {}) {
  return {
    name: "ops",
    enabled: true,
    config: config(),
    ...overrides,
  } satisfies Partial<NotificationChannel>;
}

function ruleDraft(overrides: Record<string, unknown> = {}) {
  return {
    name: "notify on failure",
    enabled: true,
    eventType: "task.execution",
    phase: "finished",
    outcome: "failure",
    channelIds: [] as string[],
    ...overrides,
  } as Parameters<typeof saveNotificationRule>[1];
}

function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    type: "task.execution",
    phase: "finished",
    outcome: "failure",
    subject: { type: "task", id: "1" },
    correlationId: "run-1",
    ...overrides,
  } as Parameters<typeof publishDomainEvent>[1];
}

/** Read the raw persisted document so tests can assert on unredacted internals. */
async function rawDocument(storage: Storage): Promise<NotificationDocument> {
  return storage.notifications.get();
}

/** Wait until the fire-and-forget delivery pipeline settles. */
async function flushDeliveries(storage: Storage): Promise<NotificationDocument> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const document = await rawDocument(storage);
    const busy = document.deliveries.some(
      (item) => item.status === "sending" || item.status === "pending"
    );
    if (!busy) return document;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return rawDocument(storage);
}

describe("notification event catalog", () => {
  it("exposes one definition per event type with matching phases and outcomes", () => {
    expect(notificationEventCatalog.map((item) => item.type)).toEqual([
      "task.execution",
      "config.publish",
      "request.process",
      "system.error",
    ]);
    for (const definition of notificationEventCatalog) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.phases.length).toBeGreaterThan(0);
      expect(definition.outcomes.length).toBeGreaterThan(0);
      expect(definition.subjectTypes.length).toBeGreaterThan(0);
    }
  });

  it("does not allow progress phases on any event type", () => {
    for (const definition of notificationEventCatalog) {
      expect(definition.phases).not.toContain("progress");
    }
  });
});

describe("validateRule", () => {
  it("requires a non-blank rule name", () => {
    expect(validateRule(ruleDraft({ name: "   " }))).toBe("规则名称不能为空。");
    expect(validateRule(ruleDraft({ name: undefined }))).toBe("规则名称不能为空。");
  });

  it("rejects event types outside the catalog", () => {
    expect(validateRule(ruleDraft({ eventType: "task.unknown", channelIds: ["c"] }))).toBe(
      "不支持的事件类型。"
    );
  });

  it("rejects phases the event type does not support", () => {
    expect(
      validateRule(ruleDraft({ eventType: "system.error", phase: "finished", channelIds: ["c"] }))
    ).toBe("该事件类型不支持所选阶段。");
    expect(
      validateRule(ruleDraft({ eventType: "config.publish", phase: "progress", channelIds: ["c"] }))
    ).toBe("该事件类型不支持所选阶段。");
  });

  it("forces non-final phases to use the unrestricted outcome", () => {
    expect(
      validateRule(ruleDraft({ phase: "started", outcome: "success", channelIds: ["c"] }))
    ).toBe("开始或执行中阶段没有最终结果，请选择不限制结果。");
    expect(
      validateRule(ruleDraft({ phase: "started", outcome: "any", channelIds: ["c"] }))
    ).toBeNull();
    expect(
      validateRule(ruleDraft({ phase: "started", outcome: null, channelIds: ["c"] }))
    ).toBeNull();
  });

  it("rejects outcomes the event type does not declare", () => {
    expect(
      validateRule(
        ruleDraft({
          eventType: "system.error",
          phase: "state_changed",
          outcome: "success",
          channelIds: ["c"],
        })
      )
    ).toBe("该事件类型不支持所选结果。");
    expect(
      validateRule(
        ruleDraft({
          eventType: "system.error",
          phase: "state_changed",
          outcome: "failure",
          channelIds: ["c"],
        })
      )
    ).toBeNull();
  });

  it("requires at least one usable channel id", () => {
    expect(validateRule(ruleDraft({ channelIds: [] }))).toBe("至少选择一个通知渠道。");
    expect(validateRule(ruleDraft({ channelIds: undefined }))).toBe("至少选择一个通知渠道。");
    expect(validateRule(ruleDraft({ channelIds: ["  "] }))).toBe("至少选择一个通知渠道。");
    expect(validateRule(ruleDraft({ channelIds: ["ok", 7] }))).toBe("至少选择一个通知渠道。");
  });

  it("accepts a well-formed rule", () => {
    expect(validateRule(ruleDraft({ channelIds: ["c"] }))).toBeNull();
  });
});

describe("notification channels", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createMemoryApplicationStorage();
  });

  it("creates a channel and returns a redacted view", async () => {
    const saved = await saveNotificationChannel(
      storage,
      channelDraft({ config: config({ url: "https://hooks.example.com/notify?token=abc123" }) })
    );
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBe(saved.updatedAt);
    expect(saved.config.url).toBe("https://hooks.example.com/notify?token=***");
    expect(saved.hasSecret).toBe(true);
    // The stored document keeps the real secret.
    const document = await rawDocument(storage);
    expect(document.channels[0].config.url).toBe("https://hooks.example.com/notify?token=abc123");
  });

  it("keeps the stored secret when the redacted placeholder is sent back", async () => {
    const created = await saveNotificationChannel(
      storage,
      channelDraft({ config: config({ url: "https://hooks.example.com/notify?token=abc123" }) })
    );
    await saveNotificationChannel(
      storage,
      channelDraft({ name: "renamed", config: created.config }),
      created.id
    );
    const document = await rawDocument(storage);
    expect(document.channels[0].name).toBe("renamed");
    expect(document.channels[0].config.url).toBe("https://hooks.example.com/notify?token=abc123");
  });

  it("restores redacted header values from the previous revision", async () => {
    const created = await saveNotificationChannel(
      storage,
      channelDraft({
        config: config({ headers: JSON.stringify({ Authorization: "Bearer real" }) }),
      })
    );
    expect(created.config.headers).toContain("***");
    await saveNotificationChannel(
      storage,
      channelDraft({ config: config({ headers: created.config.headers }) }),
      created.id
    );
    const document = await rawDocument(storage);
    expect(JSON.parse(document.channels[0].config.headers).Authorization).toBe("Bearer real");
  });

  it("clears the DingTalk secret when the provider is switched to custom", async () => {
    const created = await saveNotificationChannel(
      storage,
      channelDraft({
        config: config({
          provider: "dingtalk",
          url: "https://oapi.dingtalk.com/robot/send?access_token=abc",
          dingTalkSecret: "SECreal",
        }),
      })
    );
    expect(created.hasSecret).toBe(true);
    await saveNotificationChannel(
      storage,
      channelDraft({ config: { ...created.config, provider: "custom" } }),
      created.id
    );
    const document = await rawDocument(storage);
    expect(document.channels[0].config.dingTalkSecret).toBe("");
  });

  it("rejects an invalid webhook config and a blank name", async () => {
    await expect(
      saveNotificationChannel(
        storage,
        channelDraft({ config: config({ url: "ftp://example.com/hook" }) })
      )
    ).rejects.toThrow("must use the HTTP or HTTPS scheme");
    await expect(
      saveNotificationChannel(storage, channelDraft({ config: config({ body: "{oops" }) }))
    ).rejects.toThrow("不是合法 JSON");
    await expect(saveNotificationChannel(storage, channelDraft({ name: "  " }))).rejects.toThrow(
      "通知渠道名称不能为空。"
    );
  });

  it("allows saving a draft channel with an empty URL", async () => {
    const saved = await saveNotificationChannel(
      storage,
      channelDraft({ config: config({ url: "" }) })
    );
    expect(saved.config.url).toBe("");
  });

  it("reports a missing channel when updating an unknown id", async () => {
    await expect(
      saveNotificationChannel(storage, channelDraft(), "does-not-exist")
    ).rejects.toThrow("通知渠道不存在。");
  });

  it("refuses to delete a channel still referenced by a rule", async () => {
    const channel = await saveNotificationChannel(storage, channelDraft());
    await saveNotificationRule(storage, ruleDraft({ channelIds: [channel.id] }));
    await expect(removeNotificationChannel(storage, channel.id)).rejects.toThrow(
      "该渠道仍被通知规则引用，请先修改或删除相关规则。"
    );
  });

  it("deletes an unreferenced channel and reports unknown ids", async () => {
    const channel = await saveNotificationChannel(storage, channelDraft());
    await removeNotificationChannel(storage, channel.id);
    expect((await rawDocument(storage)).channels).toHaveLength(0);
    await expect(removeNotificationChannel(storage, channel.id)).rejects.toThrow(
      "通知渠道不存在。"
    );
  });
});

describe("notification rules", () => {
  let storage: Storage;
  let channelId: string;
  beforeEach(async () => {
    storage = createMemoryApplicationStorage();
    channelId = (await saveNotificationChannel(storage, channelDraft())).id;
  });

  it("creates a rule, de-duplicates channel ids and trims the name", async () => {
    const rule = await saveNotificationRule(
      storage,
      ruleDraft({ name: "  spaced  ", channelIds: [channelId, channelId] })
    );
    expect(rule.name).toBe("spaced");
    expect(rule.channelIds).toEqual([channelId]);
    expect(rule.outcome).toBe("failure");
    expect(rule.createdAt).toBe(rule.updatedAt);
  });

  it("stores a null outcome when the rule is unrestricted", async () => {
    const rule = await saveNotificationRule(
      storage,
      ruleDraft({ outcome: undefined, channelIds: [channelId] })
    );
    expect(rule.outcome).toBeNull();
  });

  it("rejects a rule referencing an unknown channel", async () => {
    await expect(
      saveNotificationRule(storage, ruleDraft({ channelIds: ["missing"] }))
    ).rejects.toThrow("规则引用了不存在的通知渠道。");
  });

  it("rejects an unknown rule id on update and delete", async () => {
    await expect(
      saveNotificationRule(storage, ruleDraft({ channelIds: [channelId] }), "missing")
    ).rejects.toThrow("通知规则不存在。");
    await expect(removeNotificationRule(storage, "missing")).rejects.toThrow("通知规则不存在。");
  });

  it("updates an existing rule in place and keeps its creation time", async () => {
    const rule = await saveNotificationRule(storage, ruleDraft({ channelIds: [channelId] }));
    const updated = await saveNotificationRule(
      storage,
      ruleDraft({ name: "renamed", channelIds: [channelId] }),
      rule.id
    );
    expect(updated.id).toBe(rule.id);
    expect(updated.name).toBe("renamed");
    expect(updated.createdAt).toBe(rule.createdAt);
    expect((await rawDocument(storage)).rules).toHaveLength(1);
  });

  it("deletes a rule so its channel becomes removable", async () => {
    const rule = await saveNotificationRule(storage, ruleDraft({ channelIds: [channelId] }));
    await removeNotificationRule(storage, rule.id);
    expect((await rawDocument(storage)).rules).toHaveLength(0);
    await expect(removeNotificationChannel(storage, channelId)).resolves.toBeUndefined();
  });
});

describe("publishDomainEvent", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createMemoryApplicationStorage();
  });

  it("persists the event even when no rule matches", async () => {
    await publishDomainEvent(
      storage,
      eventInput({
        type: "request.process",
        outcome: "success",
        subject: { type: "request", id: "1" },
      })
    );
    const document = await rawDocument(storage);
    expect(document.events).toHaveLength(1);
    expect(document.deliveries).toHaveLength(0);
    expect(document.events[0].schemaVersion).toBe(1);
    expect(document.events[0].occurredAt).toBeTruthy();
    expect(document.events[0].id).toBeTruthy();
  });

  it("honours caller-supplied id, occurredAt and schemaVersion", async () => {
    await publishDomainEvent(storage, {
      ...eventInput(),
      id: "fixed-id",
      occurredAt: "2026-01-02T03:04:05.000Z",
      schemaVersion: 7,
    });
    const event = (await rawDocument(storage)).events[0];
    expect(event.id).toBe("fixed-id");
    expect(event.occurredAt).toBe("2026-01-02T03:04:05.000Z");
    expect(event.schemaVersion).toBe(7);
  });

  it("creates one delivery per enabled channel on a matching rule", async () => {
    const first = await saveNotificationChannel(storage, channelDraft({ name: "a" }));
    const second = await saveNotificationChannel(storage, channelDraft({ name: "b" }));
    await saveNotificationRule(storage, ruleDraft({ channelIds: [first.id, second.id] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    expect(document.deliveries).toHaveLength(2);
    expect(document.deliveries.map((item) => item.channelId).sort()).toEqual(
      [first.id, second.id].sort()
    );
  });

  it("skips disabled rules, mismatched outcomes and mismatched subject types", async () => {
    const channel = await saveNotificationChannel(storage, channelDraft());
    await saveNotificationRule(storage, ruleDraft({ enabled: false, channelIds: [channel.id] }));
    await saveNotificationRule(
      storage,
      ruleDraft({ outcome: "success", channelIds: [channel.id] })
    );
    await saveNotificationRule(
      storage,
      ruleDraft({ subjectType: "configuration", channelIds: [channel.id] })
    );
    await publishDomainEvent(storage, eventInput());
    expect((await rawDocument(storage)).deliveries).toHaveLength(0);
  });

  it("skips disabled channels referenced by a matching rule", async () => {
    const channel = await saveNotificationChannel(storage, channelDraft({ enabled: false }));
    await saveNotificationRule(storage, ruleDraft({ channelIds: [channel.id] }));
    await publishDomainEvent(storage, eventInput());
    expect((await rawDocument(storage)).deliveries).toHaveLength(0);
  });

  it("matches rules with an unrestricted outcome", async () => {
    const channel = await saveNotificationChannel(storage, channelDraft());
    await saveNotificationRule(storage, ruleDraft({ outcome: "any", channelIds: [channel.id] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    expect(document.deliveries).toHaveLength(1);
  });

  it("redacts URLs from the event summary before persisting", async () => {
    await publishDomainEvent(
      storage,
      eventInput({ summary: "failed calling https://hooks.example.com/x?token=leak" })
    );
    const event = (await rawDocument(storage)).events[0];
    expect(event.summary).toBe("failed calling https://hooks.example.com/x?token=***");
  });

  it("trims the event and delivery logs to their caps", async () => {
    const channel = await saveNotificationChannel(storage, channelDraft());
    await saveNotificationRule(storage, ruleDraft({ channelIds: [channel.id] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    for (let index = 0; index < 205; index++) {
      await publishDomainEvent(
        storage,
        eventInput({ id: `e-${index}`, correlationId: `c-${index}` })
      );
    }
    await flushDeliveries(storage);
    const document = await rawDocument(storage);
    expect(document.events).toHaveLength(200);
    expect(document.deliveries.length).toBeLessThanOrEqual(500);
    expect(document.events[0].id).toBe("e-5");
  });

  it("swallows storage failures instead of rejecting the caller", async () => {
    const broken = {
      ...storage,
      notifications: {
        get: () => Promise.reject(new Error("disk gone")),
        set: () => Promise.reject(new Error("disk gone")),
      },
    } as unknown as Storage;
    await expect(publishDomainEvent(broken, eventInput())).resolves.toBeUndefined();
  });
});

describe("delivery pipeline", () => {
  let storage: Storage;
  let channelId: string;
  beforeEach(async () => {
    storage = createMemoryApplicationStorage();
    channelId = (await saveNotificationChannel(storage, channelDraft())).id;
    await saveNotificationRule(storage, ruleDraft({ channelIds: [channelId] }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks a delivery succeeded on a 2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    const delivery = document.deliveries[0];
    expect(delivery.status).toBe("succeeded");
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.deliveredAt).toBeTruthy();
    expect(delivery.lastError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("stops immediately on a permanent 4xx failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    const delivery = document.deliveries[0];
    expect(delivery.status).toBe("failed");
    expect(delivery.attemptCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a 5xx up to the attempt cap before failing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    const delivery = document.deliveries[0];
    expect(delivery.status).toBe("failed");
    expect(delivery.attemptCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(delivery.lastError).toBeTruthy();
  }, 15_000);

  it("treats 429 as retryable rather than permanent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    expect(document.deliveries[0].attemptCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("never leaks the channel URL or secret into the stored error", async () => {
    const secretChannel = await saveNotificationChannel(
      storage,
      channelDraft({ config: config({ url: "https://hooks.example.com/notify?token=topsecret" }) })
    );
    await saveNotificationRule(storage, ruleDraft({ channelIds: [secretChannel.id] }));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new Error("connect ECONNREFUSED https://hooks.example.com/notify?token=topsecret")
        )
    );
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    const delivery = document.deliveries.find((item) => item.channelId === secretChannel.id)!;
    expect(delivery.lastError).not.toContain("topsecret");
    expect(delivery.lastError).toContain("[redacted]");
  }, 15_000);

  it("fails the delivery when the rule is disabled mid-flight", async () => {
    const rule = (await rawDocument(storage)).rules[0];
    const document = await rawDocument(storage);
    document.rules = document.rules.map((item) => ({ ...item, id: rule.id, enabled: false }));
    await storage.notifications.set(document);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await publishDomainEvent(storage, eventInput());
    const result = await flushDeliveries(storage);
    expect(result.deliveries).toHaveLength(0);
  });
});

describe("retryNotificationDelivery", () => {
  let storage: Storage;
  let channelId: string;
  beforeEach(async () => {
    storage = createMemoryApplicationStorage();
    channelId = (await saveNotificationChannel(storage, channelDraft())).id;
    await saveNotificationRule(storage, ruleDraft({ channelIds: [channelId] }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedFailedDelivery(): Promise<string> {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    await publishDomainEvent(storage, eventInput());
    const document = await flushDeliveries(storage);
    const delivery = document.deliveries[0];
    expect(delivery.status).toBe("failed");
    return delivery.id;
  }

  it("re-sends a failed delivery and marks it succeeded", async () => {
    const deliveryId = await seedFailedDelivery();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await retryNotificationDelivery(storage, deliveryId);
    const document = await flushDeliveries(storage);
    const delivery = document.deliveries.find((item) => item.id === deliveryId)!;
    expect(delivery.status).toBe("succeeded");
    expect(delivery.lastError).toBeUndefined();
    expect(delivery.attemptCount).toBeGreaterThan(1);
  });

  it("rejects unknown, non-failed and sending deliveries", async () => {
    await expect(retryNotificationDelivery(storage, "missing")).rejects.toThrow("投递记录不存在。");
    const deliveryId = await seedFailedDelivery();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await retryNotificationDelivery(storage, deliveryId);
    await flushDeliveries(storage);
    await expect(retryNotificationDelivery(storage, deliveryId)).rejects.toThrow(
      "只有失败的通知可以手动重试。"
    );

    const document = await rawDocument(storage);
    document.deliveries[0].status = "sending";
    await storage.notifications.set(document);
    await expect(retryNotificationDelivery(storage, deliveryId)).rejects.toThrow(
      "该通知正在发送，请稍后再试。"
    );
  });

  it("rejects when the channel has since been disabled", async () => {
    const deliveryId = await seedFailedDelivery();
    const document = await rawDocument(storage);
    document.channels = document.channels.map((item) => ({ ...item, enabled: false }));
    await storage.notifications.set(document);
    await expect(retryNotificationDelivery(storage, deliveryId)).rejects.toThrow(
      "事件或已启用的渠道不存在。"
    );
  });
});

describe("testNotificationChannel", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createMemoryApplicationStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a test payload to the configured endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const channel = await saveNotificationChannel(storage, channelDraft());
    const result = await testNotificationChannel(storage, channel.id);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://hooks.example.com/notify");
  });

  it("rejects unknown and disabled channels", async () => {
    await expect(testNotificationChannel(storage, "missing")).rejects.toThrow("通知渠道不存在。");
    const channel = await saveNotificationChannel(storage, channelDraft({ enabled: false }));
    await expect(testNotificationChannel(storage, channel.id)).rejects.toThrow(
      "请先启用通知渠道。"
    );
  });

  it("rejects a channel whose stored config is invalid", async () => {
    const channel = await saveNotificationChannel(
      storage,
      channelDraft({ config: config({ url: "" }) })
    );
    await expect(testNotificationChannel(storage, channel.id)).rejects.toThrow("不能为空");
  });

  it("returns the provider failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const channel = await saveNotificationChannel(storage, channelDraft());
    const result = await testNotificationChannel(storage, channel.id);
    expect(result.success).toBe(false);
    expect(result.message).toContain("socket hang up");
  });
});

describe("resumePendingNotificationDeliveries", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createMemoryApplicationStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedDocument(deliveries: NotificationDocument["deliveries"]): Promise<void> {
    const document = await storage.notifications.get();
    const event: DomainEvent = {
      id: "evt-1",
      type: "task.execution",
      phase: "finished",
      outcome: "failure",
      subject: { type: "task", id: "1" },
      occurredAt: new Date().toISOString(),
      correlationId: "run-1",
      schemaVersion: 1,
    };
    const channel: NotificationChannel = {
      id: "chan-1",
      name: "ops",
      provider: "custom",
      enabled: true,
      config: normalizeWebhookConfig(config()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const rule: NotificationRule = {
      id: "rule-1",
      name: "resume rule",
      enabled: true,
      eventType: "task.execution",
      phase: "finished",
      outcome: "failure",
      channelIds: ["chan-1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await storage.notifications.set({
      ...document,
      events: [event],
      channels: [channel],
      rules: [rule],
      deliveries,
    });
  }

  it("re-delivers pending and sending records left over from a previous process", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await seedDocument([
      {
        id: "d-1",
        eventId: "evt-1",
        ruleId: "rule-1",
        channelId: "chan-1",
        status: "pending",
        attemptCount: 0,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "d-2",
        eventId: "evt-1",
        ruleId: "rule-1",
        channelId: "chan-1",
        status: "sending",
        attemptCount: 1,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    await resumePendingNotificationDeliveries(storage);
    const document = await flushDeliveries(storage);
    expect(document.deliveries.every((item) => item.status === "succeeded")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores records that already reached a terminal state", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await seedDocument([
      {
        id: "d-1",
        eventId: "evt-1",
        ruleId: "r",
        channelId: "chan-1",
        status: "succeeded",
        attemptCount: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "d-2",
        eventId: "evt-1",
        ruleId: "r",
        channelId: "chan-1",
        status: "failed",
        attemptCount: 3,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    await resumePendingNotificationDeliveries(storage);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the same promise for concurrent callers and swallows storage errors", async () => {
    await seedDocument([]);
    const first = resumePendingNotificationDeliveries(storage);
    const second = resumePendingNotificationDeliveries(storage);
    expect(first).toBe(second);
    await expect(first).resolves.toBeUndefined();

    const broken = {
      ...storage,
      notifications: {
        get: () => Promise.reject(new Error("gone")),
        set: () => Promise.reject(new Error("gone")),
      },
    } as unknown as Storage;
    await expect(resumePendingNotificationDeliveries(broken)).resolves.toBeUndefined();
  });
});
