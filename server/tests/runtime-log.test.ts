import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtimeLog } from "../utils/runtime-log";

type Level = "log" | "info" | "warn" | "error";

const originalEnv = { ...process.env };

function capture(level: Level): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, level).mockImplementation(() => undefined);
}

function lastOutput(spy: ReturnType<typeof vi.spyOn>): string {
  const calls = spy.mock.calls as unknown[][];
  return String(calls[calls.length - 1]![0]);
}

beforeEach(() => {
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("runtimeLog", () => {
  it("prefixes each line with a timestamp and indents continuations", () => {
    const spy = capture("info");
    runtimeLog("info", "first line\nsecond line");
    const output = lastOutput(spy);

    const lines = output.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] first line$/);
    // Continuation lines align with the message column (22 characters).
    expect(lines[1]).toBe(" ".repeat(22) + "second line");
  });

  it("dispatches to the matching console method", () => {
    const spies: Record<Level, ReturnType<typeof vi.spyOn>> = {
      log: capture("log"),
      info: capture("info"),
      warn: capture("warn"),
      error: capture("error"),
    };
    for (const level of Object.keys(spies) as Level[]) {
      runtimeLog(level, `${level} message`);
      expect(spies[level]).toHaveBeenCalledTimes(1);
    }
  });

  it("formats extra details with a deep object depth", () => {
    const spy = capture("info");
    runtimeLog("info", "with detail", { a: { b: { c: { d: "deep" } } } });
    expect(lastOutput(spy)).toContain("deep");
  });

  it("handles Windows line endings", () => {
    const spy = capture("warn");
    runtimeLog("warn", "one\r\ntwo");
    expect(lastOutput(spy).split("\n")).toHaveLength(2);
  });

  it("emits no ANSI escapes when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    const spy = capture("error");
    runtimeLog("error", "plain");
    expect(lastOutput(spy)).not.toContain("\u001b[");
  });

  it("emits no ANSI escapes when FORCE_COLOR is 0", () => {
    process.env.FORCE_COLOR = "0";
    const spy = capture("error");
    runtimeLog("error", "plain");
    expect(lastOutput(spy)).not.toContain("\u001b[");
  });

  it("colors the timestamp when FORCE_COLOR requests it", () => {
    process.env.FORCE_COLOR = "1";
    const spy = capture("info");
    runtimeLog("info", "colored");
    const output = lastOutput(spy);
    expect(output).toContain("\u001b[38;5;245m");
    expect(output).toContain("\u001b[0m");
  });

  it("colors warning and error bodies", () => {
    process.env.FORCE_COLOR = "1";
    const warn = capture("warn");
    runtimeLog("warn", "careful");
    expect(lastOutput(warn)).toContain("\u001b[38;5;179m");

    const error = capture("error");
    runtimeLog("error", "broken");
    expect(lastOutput(error)).toContain("\u001b[38;5;167m");
  });

  it("colors only the timestamp for log and info levels", () => {
    process.env.FORCE_COLOR = "1";
    const spy = capture("log");
    runtimeLog("log", "neutral");
    const output = lastOutput(spy);
    // The timestamp is colored, the body is not: exactly one reset before the message.
    expect(output.split("\u001b[0m")).toHaveLength(2);
  });

  it("falls back to a timestamp without a time zone when TZ is invalid", () => {
    process.env.TZ = "Not/AZone";
    const spy = capture("info");
    runtimeLog("info", "tz fallback");
    // The invalid zone is ignored by the formatter, but the line must still render.
    expect(lastOutput(spy)).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] tz fallback$/);
  });

  it("honours a valid TZ override", () => {
    process.env.TZ = "UTC";
    const spy = capture("info");
    runtimeLog("info", "utc");
    expect(lastOutput(spy)).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] utc$/);
  });
});
