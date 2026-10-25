import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TEST_BODY,
  createDefaultWebhookConfig,
  normalizeAppSettings,
  normalizeWebhookConfig,
} from "../domain/settings";

describe("createDefaultWebhookConfig", () => {
  it("builds a custom provider draft with the shared JSON body template", () => {
    const config = createDefaultWebhookConfig();
    expect(config.provider).toBe("custom");
    expect(config.method).toBe("POST");
    expect(config.url).toBe("");
    expect(config.headers).toBe("{}");
    expect(config.body).toBe("");
    expect(config.dingTalkSecret).toBe("");
    expect(config.dingTalkMessageType).toBe("text");
    expect(config.testBody).toBe(DEFAULT_TEST_BODY);
    expect(JSON.parse(DEFAULT_TEST_BODY)).toEqual({
      ok: "{{ok}}",
      event: "{{event}}",
      message: "{{message}}",
      timestamp: "{{timestamp}}",
    });
  });

  it("localizes the built-in message templates", () => {
    expect(createDefaultWebhookConfig("zh_CN").messageTemplate).not.toBe(
      createDefaultWebhookConfig("en_US").messageTemplate
    );
    expect(createDefaultWebhookConfig("zh_CN").messageTemplate.length).toBeGreaterThan(0);
  });
});

describe("normalizeWebhookConfig", () => {
  it("falls back to defaults for non-object input", () => {
    const defaults = normalizeWebhookConfig(null);
    expect(normalizeWebhookConfig("text")).toEqual(defaults);
    expect(normalizeWebhookConfig([])).toEqual(defaults);
    expect(defaults.provider).toBe("custom");
    expect(defaults.method).toBe("POST");
    expect(defaults.headers).toBe("{}");
    expect(defaults.url).toBe("");
    // Built-in templates normalize to "" so the UI can show them as placeholders.
    expect(defaults.messageTemplate).toBe("");
    expect(defaults.testMessageTemplate).toBe("");
  });

  it("accepts only the supported provider, method and message type", () => {
    expect(normalizeWebhookConfig({ provider: "dingtalk" }).provider).toBe("dingtalk");
    expect(normalizeWebhookConfig({ provider: "slack" }).provider).toBe("custom");
    expect(normalizeWebhookConfig({ method: "PUT" }).method).toBe("PUT");
    expect(normalizeWebhookConfig({ method: "PATCH" }).method).toBe("PATCH");
    expect(normalizeWebhookConfig({ method: "DELETE" }).method).toBe("POST");
    expect(normalizeWebhookConfig({ dingTalkMessageType: "markdown" }).dingTalkMessageType).toBe(
      "markdown"
    );
    expect(normalizeWebhookConfig({ dingTalkMessageType: "card" }).dingTalkMessageType).toBe(
      "text"
    );
  });

  it("trims the URL and coerces string fields", () => {
    const config = normalizeWebhookConfig({
      url: "  https://example.com/hook  ",
      body: 42,
      headers: 7,
      dingTalkSecret: 99,
      testBody: 1,
    });
    expect(config.url).toBe("https://example.com/hook");
    expect(config.body).toBe("42");
    expect(config.headers).toBe("7");
    expect(config.dingTalkSecret).toBe("99");
    expect(config.testBody).toBe("1");
  });

});

describe("normalizeAppSettings", () => {
  it("returns defaults for non-object input", () => {
    const normalized = normalizeAppSettings(null);
    expect(normalizeAppSettings([1, 2, 3])).toEqual(normalized);
    expect(normalizeAppSettings("remote")).toEqual(normalized);
    expect(normalized.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(normalized.pacProxy).toBe(DEFAULT_SETTINGS.pacProxy);
    expect(normalized.timezone).toBe(DEFAULT_SETTINGS.timezone);
    expect(normalized.logRetentionDays).toBe(DEFAULT_SETTINGS.logRetentionDays);
  });

  it("accepts the remote generation mode and rejects unknown modes", () => {
    expect(normalizeAppSettings({ mode: "remote" }).mode).toBe("remote");
    expect(normalizeAppSettings({ mode: "custom" }).mode).toBe("custom");
    expect(normalizeAppSettings({ mode: "hybrid" }).mode).toBe("custom");
  });

  it("falls back to the default PAC proxy only when the value is falsy", () => {
    expect(normalizeAppSettings({ pacProxy: "" }).pacProxy).toBe(DEFAULT_SETTINGS.pacProxy);
    expect(normalizeAppSettings({ pacProxy: null }).pacProxy).toBe(DEFAULT_SETTINGS.pacProxy);
    // A whitespace-only value is truthy, so it survives the fallback and is then trimmed.
    expect(normalizeAppSettings({ pacProxy: "   " }).pacProxy).toBe("");
    expect(normalizeAppSettings({ pacProxy: "PROXY 10.0.0.1:8080" }).pacProxy).toBe(
      "PROXY 10.0.0.1:8080"
    );
  });

  it("trims and de-duplicates list entries while dropping blank values", () => {
    const settings = normalizeAppSettings({
      blockList: ["  a.example  ", "", "   ", "b.example"],
      directList: ["c.example", 5 as unknown as string],
    });
    expect(settings.blockList).toEqual(["a.example", "b.example"]);
    expect(settings.directList).toEqual(["c.example", "5"]);
  });

  it("replaces non-array lists with empty arrays", () => {
    expect(normalizeAppSettings({ blockList: "a.example", directList: 5 }).blockList).toEqual([]);
    expect(normalizeAppSettings({ blockList: "a.example", directList: 5 }).directList).toEqual([]);
  });

  it("clamps the log retention window into 0..3650 days", () => {
    expect(normalizeAppSettings({ logRetentionDays: -5 }).logRetentionDays).toBe(0);
    expect(normalizeAppSettings({ logRetentionDays: 99999 }).logRetentionDays).toBe(3650);
    expect(normalizeAppSettings({ logRetentionDays: 12.7 }).logRetentionDays).toBe(12);
    expect(normalizeAppSettings({ logRetentionDays: "abc" }).logRetentionDays).toBe(0);
    expect(normalizeAppSettings({}).logRetentionDays).toBe(30);
  });

  it("validates the time zone and falls back to the default", () => {
    expect(normalizeAppSettings({ timezone: "UTC" }).timezone).toBe("UTC");
    expect(normalizeAppSettings({ timezone: "Mars/Olympus" }).timezone).toBe(
      DEFAULT_SETTINGS.timezone
    );
    expect(normalizeAppSettings({ timezone: "" }).timezone).toBe(DEFAULT_SETTINGS.timezone);
  });

  it("trims the cron schedule and coerces pacCompress to a boolean", () => {
    expect(normalizeAppSettings({ cronSchedule: "  */5 * * * *  " }).cronSchedule).toBe(
      "*/5 * * * *"
    );
    expect(normalizeAppSettings({ cronSchedule: 123 }).cronSchedule).toBe("123");
    expect(normalizeAppSettings({ pacCompress: false }).pacCompress).toBe(false);
    expect(normalizeAppSettings({ pacCompress: "yes" }).pacCompress).toBe(true);
  });

});

