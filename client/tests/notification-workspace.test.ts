import { describe, expect, it } from "vitest";
import { t } from "@shared/i18n";
import {
  emptyConfig,
  headersForEditor,
  templateForEditor,
} from "../src/features/notifications/composables/useNotificationWorkspace";

describe("notification webhook 默认值规范化", () => {
  it("新建频道不预填默认内容，默认值交给 placeholder 展示", () => {
    expect(emptyConfig().headers).toBe("");
    expect(emptyConfig().body).toBe("");
    expect(emptyConfig().testBody).toBe("");
    expect(emptyConfig().messageTemplate).toBe("");
    expect(emptyConfig().testMessageTemplate).toBe("");
  });

  it("等于内置默认模板的存量值在编辑器中按未设置处理", () => {
    for (const locale of ["zh_CN", "en_US"] as const) {
      expect(templateForEditor(t(locale, "settings.defaultMessageTemplate"))).toBe("");
      expect(templateForEditor(t(locale, "settings.testMessageTemplate"))).toBe("");
    }
    expect(templateForEditor("自定义模板内容")).toBe("自定义模板内容");
    expect(templateForEditor("PacPilot test notification")).toBe("PacPilot test notification");
    expect(templateForEditor("")).toBe("");
  });

  it('存量 "{}" 请求头在编辑器中按未设置处理', () => {
    expect(headersForEditor("{}")).toBe("");
    expect(headersForEditor('{"Authorization": "Bearer …"}')).toBe('{"Authorization": "Bearer …"}');
    expect(headersForEditor("")).toBe("");
  });
});
