import { describe, expect, it } from "bun:test";
import { createDefaultWebhookConfig } from "../db/settings";
import { validateWebhookConfig } from "./webhook";

describe("validateWebhookConfig", () => {
  it("accepts a custom JSON webhook with custom headers", () => {
    const config = {
      ...createDefaultWebhookConfig(),
      url: "https://hooks.example.com/pac",
      headers: JSON.stringify({ Authorization: "Bearer example", "X-Event": "pac" }),
      body: JSON.stringify({ event: "{{event}}", timestamp: "{{timestamp}}" }),
      method: "PATCH" as const,
    };
    expect(validateWebhookConfig(config)).toEqual([]);
  });

  it("rejects invalid JSON and unsafe header overrides for custom webhooks", () => {
    const config = {
      ...createDefaultWebhookConfig(),
      url: "https://hooks.example.com/pac",
      body: "{not-json",
      headers: JSON.stringify({ "Content-Type": "text/plain" }),
    };
    const errors = validateWebhookConfig(config);
    expect(errors.some((error) => error.includes("JSON"))).toBe(true);
    expect(errors.some((error) => error.includes("传输字段"))).toBe(true);
  });

  it("requires a complete DingTalk robot URL with access_token", () => {
    const config = {
      ...createDefaultWebhookConfig(),
      provider: "dingtalk" as const,
      url: "https://oapi.dingtalk.com/robot/send",
    };
    expect(validateWebhookConfig(config).some((error) => error.includes("access_token"))).toBe(true);
  });

  it("accepts DingTalk signature mode and a complete robot URL", () => {
    const config = {
      ...createDefaultWebhookConfig(),
      provider: "dingtalk" as const,
      url: "https://oapi.dingtalk.com/robot/send?access_token=example-token",
      dingTalkSecret: "SEC_test-secret",
      dingTalkMessageType: "markdown" as const,
      messageTemplate: "### {{status}}\n{{message}}\n{{timestamp}}",
    };
    expect(validateWebhookConfig(config)).toEqual([]);
  });
});
