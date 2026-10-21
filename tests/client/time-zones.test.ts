import { describe, expect, it } from "vitest";
import { commonTimeZones, isValidTimeZone } from "../../client/src/utils/time-zones";

describe("time zone helpers", () => {
  it("provides unique, non-empty common time zones", () => {
    const values = commonTimeZones.map((zone) => zone.value);
    expect(values.length).toBeGreaterThan(10);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every(Boolean)).toBe(true);
  });

  it("accepts valid zones after trimming whitespace", () => {
    expect(isValidTimeZone(" Asia/Shanghai ")).toBe(true);
    expect(isValidTimeZone("Etc/UTC")).toBe(true);
  });

  it("rejects empty and unknown time zones", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
