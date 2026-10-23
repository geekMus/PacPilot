import { describe, expect, it } from "vitest";
import { validateSettingsPayload } from "../utils/settings-validation";

describe("validateSettingsPayload", () => {
  it("accepts an empty object and supported setting values", () => {
    expect(validateSettingsPayload({})).toBeNull();
    expect(validateSettingsPayload({
      mode: "remote",
      pacProxy: "PROXY proxy.example.com:8080",
      listUrl: "https://rules.example.com/list.txt",
      cronSchedule: "0 */6 * * *",
      timezone: "Asia/Shanghai",
      pacCompress: true,
      blockList: ["blocked.example.com"],
      directList: "internal.example.com",
      logRetentionDays: 30,
      webhookSuccessConfig: {
        provider: "custom",
        method: "POST",
        url: "https://hooks.example.com",
        headers: "{}",
        body: "{}",
      },
    })).toBeNull();
  });

  it("rejects non-object payloads and unsupported modes", () => {
    expect(validateSettingsPayload(null as never)).toBe("request body must be a JSON object");
    expect(validateSettingsPayload([] as never)).toBe("request body must be a JSON object");
    expect(validateSettingsPayload({ mode: "other" })).toBe("mode must be 'custom' or 'remote'");
  });

  it("validates string and boolean fields", () => {
    for (const key of ["pacProxy", "listUrl", "cronSchedule", "timezone"]) {
      expect(validateSettingsPayload({ [key]: 1 })).toBe(key + " must be a string");
    }
    expect(validateSettingsPayload({ pacCompress: "true" })).toBe("pacCompress must be a boolean");
  });

  it("validates domain lists and log retention bounds", () => {
    expect(validateSettingsPayload({ blockList: [1] })).toBe("blockList must be a string or an array of strings");
    expect(validateSettingsPayload({ directList: {} })).toBe("directList must be a string or an array of strings");
    for (const value of [-1, 3651, 1.5, Infinity, "30"]) {
      expect(validateSettingsPayload({ logRetentionDays: value })).toBe(
        "logRetentionDays must be an integer between 0 and 3650"
      );
    }
  });

  it("validates webhook config object, field types and enum values", () => {
    for (const value of [null, [], "bad"]) {
      expect(validateSettingsPayload({ webhookSuccessConfig: value })).toBe(
        "webhookSuccessConfig must be an object"
      );
    }
    expect(validateSettingsPayload({ webhookFailureConfig: { url: 123 } })).toBe(
      "webhookFailureConfig.url must be a string"
    );
    expect(validateSettingsPayload({ webhookSuccessConfig: { provider: "other" } })).toBe(
      "webhookSuccessConfig.provider is unsupported"
    );
    expect(validateSettingsPayload({ webhookSuccessConfig: { method: "GET" } })).toBe(
      "webhookSuccessConfig.method is unsupported"
    );
    expect(validateSettingsPayload({ webhookSuccessConfig: { dingTalkMessageType: "image" } })).toBe(
      "webhookSuccessConfig.dingTalkMessageType is unsupported"
    );
  });

  it("covers all optional webhook string fields and accepted enum values", () => {
    for (const key of ["webhookSuccessConfig", "webhookFailureConfig"] as const) {
      for (const field of [
        "url",
        "headers",
        "body",
        "dingTalkSecret",
        "testBody",
        "messageTemplate",
        "testMessageTemplate",
      ]) {
        expect(validateSettingsPayload({ [key]: { [field]: 123 } })).toBe(
          key + "." + field + " must be a string"
        );
        expect(validateSettingsPayload({ [key]: { [field]: "" } })).toBeNull();
      }
      for (const provider of ["custom", "dingtalk"]) {
        expect(validateSettingsPayload({ [key]: { provider } })).toBeNull();
      }
      for (const method of ["POST", "PUT", "PATCH"]) {
        expect(validateSettingsPayload({ [key]: { method } })).toBeNull();
      }
      for (const dingTalkMessageType of ["text", "markdown"]) {
        expect(validateSettingsPayload({ [key]: { dingTalkMessageType } })).toBeNull();
      }
    }
  });

  it("accepts boundary retention values and validates list and mode alternatives", () => {
    expect(validateSettingsPayload({ mode: "custom", logRetentionDays: 0 })).toBeNull();
    expect(validateSettingsPayload({ mode: "remote", logRetentionDays: 3650 })).toBeNull();
    expect(validateSettingsPayload({ blockList: "blocked.example.com", directList: ["one.example", "two.example"] }))
      .toBeNull();
    expect(validateSettingsPayload({ pacCompress: false })).toBeNull();
  });

});
