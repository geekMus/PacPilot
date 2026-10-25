import { describe, expect, it } from "vitest";
import { emptyConfig } from "../src/features/notifications/composables/useNotificationWorkspace";

describe("notification webhook 默认值规范化", () => {
  it("新建频道不预填默认内容，默认值交给 placeholder 展示", () => {
    expect(emptyConfig().headers).toBe("");
    expect(emptyConfig().body).toBe("");
    expect(emptyConfig().testBody).toBe("");
    expect(emptyConfig().messageTemplate).toBe("");
    expect(emptyConfig().testMessageTemplate).toBe("");
  });
});
