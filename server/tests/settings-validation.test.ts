import { describe, expect, it } from "vitest";
import { validateSettingsPayload } from "../utils/settings-validation";

describe("validateSettingsPayload", () => {
  it("accepts an empty object and supported setting values", () => {
    expect(validateSettingsPayload({})).toBeNull();
    expect(
      validateSettingsPayload({
        mode: "remote",
        pacProxy: "PROXY proxy.example.com:8080",
        listUrl: "https://rules.example.com/list.txt",
        cronSchedule: "0 */6 * * *",
        timezone: "Asia/Shanghai",
        pacCompress: true,
        pacObfuscate: false,
        blockList: ["blocked.example.com"],
        directList: "internal.example.com",
        logRetentionDays: 30,
      })
    ).toBeNull();
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
    expect(validateSettingsPayload({ pacObfuscate: "true" })).toBe(
      "pacObfuscate must be a boolean"
    );
  });

  it("validates domain lists and log retention bounds", () => {
    expect(validateSettingsPayload({ blockList: [1] })).toBe(
      "blockList must be a string or an array of strings"
    );
    expect(validateSettingsPayload({ directList: {} })).toBe(
      "directList must be a string or an array of strings"
    );
    for (const value of [-1, 3651, 1.5, Infinity, "30"]) {
      expect(validateSettingsPayload({ logRetentionDays: value })).toBe(
        "logRetentionDays must be an integer between 0 and 3650"
      );
    }
  });

  it("accepts boundary retention values and validates list and mode alternatives", () => {
    expect(validateSettingsPayload({ mode: "custom", logRetentionDays: 0 })).toBeNull();
    expect(validateSettingsPayload({ mode: "remote", logRetentionDays: 3650 })).toBeNull();
    expect(
      validateSettingsPayload({
        blockList: "blocked.example.com",
        directList: ["one.example", "two.example"],
      })
    ).toBeNull();
    expect(validateSettingsPayload({ pacCompress: false })).toBeNull();
  });
});
