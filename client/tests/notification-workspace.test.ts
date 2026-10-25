import { describe, expect, it } from "vitest";
import {
  emptyConfig,
  normalizeLoadedConfig,
} from "../src/features/notifications/composables/useNotificationWorkspace";
import type { WebhookConfig } from "../src/api/client";

const base: WebhookConfig = {
  provider: "custom",
  url: "https://example.com/hook",
  method: "POST",
  headers: "",
  body: "",
  dingTalkSecret: "",
  dingTalkMessageType: "text",
  testBody: "",
  messageTemplate: "",
  testMessageTemplate: "",
};

describe("notification webhook 默认值规范化", () => {
  it("新建频道不预填默认内容，默认值交给 placeholder 展示", () => {
    expect(emptyConfig().headers).toBe("");
    expect(emptyConfig().body).toBe("");
    expect(emptyConfig().testBody).toBe("");
    expect(emptyConfig().messageTemplate).toBe("");
    expect(emptyConfig().testMessageTemplate).toBe("");
  });

  it("旧版本自动预填的内置默认值在编辑时显示为空", () => {
    const loaded = normalizeLoadedConfig({
      ...base,
      headers: "{}",
      testBody: '{"event":"{{event}}","status":"{{status}}","message":"{{message}}"}',
      messageTemplate: "{{event}}\\n{{status}}\\n{{message}}",
      testMessageTemplate: "PacPilot test",
    });
    expect(loaded.headers).toBe("");
    expect(loaded.testBody).toBe("");
    expect(loaded.messageTemplate).toBe("");
    expect(loaded.testMessageTemplate).toBe("");
    // 与默认值无关的字段不受影响。
    expect(loaded.url).toBe(base.url);
  });

  it("用户自定义的内容保持原样", () => {
    const custom = normalizeLoadedConfig({
      ...base,
      headers: '{"X-Token":"abc"}',
      testBody: '{"kind":"custom"}',
      messageTemplate: "自定义模板 {{message}}",
      testMessageTemplate: "自定义测试通知",
    });
    expect(custom.headers).toBe('{"X-Token":"abc"}');
    expect(custom.testBody).toBe('{"kind":"custom"}');
    expect(custom.messageTemplate).toBe("自定义模板 {{message}}");
    expect(custom.testMessageTemplate).toBe("自定义测试通知");
  });
});
