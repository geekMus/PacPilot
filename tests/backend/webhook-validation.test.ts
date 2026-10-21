import { describe, expect, test } from "bun:test";
import { createDefaultWebhookConfig, DEFAULT_SETTINGS } from "../../server/db/settings";
import { validateWebhookConfig } from "../../server/services/webhook";

describe("server-side webhook configuration validation", () => {
  function custom(overrides: Record<string, unknown> = {}) {
    return {
      ...createDefaultWebhookConfig(),
      url: "https://hooks.example.com/notify",
      ...overrides,
    };
  }

  test("accepts a valid custom webhook with JSON body and string headers", () => {
    expect(
      validateWebhookConfig(
        custom({
          headers: JSON.stringify({ Authorization: "Bearer test", "X-Trace": "trace-1" }),
          body: JSON.stringify({ event: "{{event}}", message: "{{message}}" }),
          testBody: JSON.stringify({ event: "test" }),
        }) as ReturnType<typeof createDefaultWebhookConfig>
      )
    ).toEqual([]);
  });

  test.each([
    ["{", "invalid body JSON"],
    ["[]", "body must be object or array depending on validation"],
  ])("validates custom body JSON (%s)", (body) => {
    const errors = validateWebhookConfig(custom({ body }) as ReturnType<typeof createDefaultWebhookConfig>);
    expect(errors.length).toBeGreaterThan(0);
  });

  test.each([
    [{ "Content-Length": "12" }, "transport-controlled header"],
    [{ Host: "example.com" }, "Host override"],
    [{ "X-Trace": "line1\r\nInjected: yes" }, "header injection"],
    [{ "X-Trace": 42 }, "non-string header value"],
  ])("rejects unsafe custom headers (%j)", (headers) => {
    const errors = validateWebhookConfig(
      custom({ headers: JSON.stringify(headers) }) as ReturnType<typeof createDefaultWebhookConfig>
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects loopback targets even though LAN webhooks are supported", () => {
    const errors = validateWebhookConfig(custom({ url: "http://127.0.0.1:8080/hook" }) as ReturnType<typeof createDefaultWebhookConfig>);
    expect(errors.some((error) => /loopback/i.test(error))).toBe(true);
  });

  test("allows a private LAN target for a self-hosted notification service", () => {
    expect(
      validateWebhookConfig(custom({ url: "http://192.168.31.10:8080/notify" }) as ReturnType<typeof createDefaultWebhookConfig>)
    ).toEqual([]);
  });

  test("requires a complete DingTalk URL and signing secret", () => {
    const dingTalk = {
      ...createDefaultWebhookConfig(),
      provider: "dingtalk" as const,
      url: "https://oapi.dingtalk.com/robot/send?access_token=token",
      dingTalkSecret: "",
    };
    expect(validateWebhookConfig(dingTalk).join("\n")).toContain("Secret");
    expect(validateWebhookConfig({ ...dingTalk, dingTalkSecret: "secret", url: "https://oapi.dingtalk.com/robot/send" }).join("\n")).toContain("access_token");
    expect(validateWebhookConfig({ ...dingTalk, dingTalkSecret: "secret" })).toEqual([]);
  });

  test("does not mutate application defaults while validating a draft", () => {
    const originalUrl = DEFAULT_SETTINGS.webhookSuccessConfig.url;
    validateWebhookConfig(custom({ url: "https://hooks.example.com" }) as ReturnType<typeof createDefaultWebhookConfig>);
    expect(DEFAULT_SETTINGS.webhookSuccessConfig.url).toBe(originalUrl);
  });
});
