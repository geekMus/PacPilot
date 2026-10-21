import { describe, expect, test } from "bun:test";
import { validateSettingsPayload } from "../server/utils/settings-validation";

describe("settings API runtime validation", () => {
  test("accepts correctly typed settings fields", () => {
    expect(
      validateSettingsPayload({
        mode: "custom",
        pacProxy: "PROXY 127.0.0.1:7890",
        pacCompress: false,
        blockList: ["ads.example"],
        directList: "intranet.example",
        timezone: "Asia/Shanghai",
        logRetentionDays: 30,
        webhookSuccessConfig: {},
      })
    ).toBeNull();
  });

  test("rejects string booleans instead of coercing them to true", () => {
    expect(validateSettingsPayload({ pacCompress: "false" })).toBe(
      "pacCompress must be a boolean"
    );
  });

  test("rejects unsupported modes and malformed lists", () => {
    expect(validateSettingsPayload({ mode: "unknown" })).toContain("mode");
    expect(validateSettingsPayload({ blockList: [1, "example.com"] })).toContain("blockList");
  });

  test("rejects invalid retention limits", () => {
    expect(validateSettingsPayload({ logRetentionDays: 3651 })).toContain("logRetentionDays");
    expect(validateSettingsPayload({ logRetentionDays: 1.5 })).toContain("logRetentionDays");
  });
});
