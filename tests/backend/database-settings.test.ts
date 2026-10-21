import { afterEach, describe, expect, test } from "bun:test";
import {
  appendGenerationLog,
  createDatabase,
  getSettings,
  recentLogs,
  updateSettings,
} from "../../server/db/sqlite";
import type { AppDatabase } from "../../server/db/sqlite";

let database: AppDatabase | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

describe("SQLite settings and generation-log repository", () => {
  function setup(): AppDatabase {
    database = createDatabase(":memory:");
    return database;
  }

  test("persists a partial settings update without resetting unrelated fields", () => {
    const db = setup();
    const before = getSettings(db);
    const updated = updateSettings(db, { timezone: "UTC", logRetentionDays: 90 });

    expect(updated.timezone).toBe("UTC");
    expect(updated.logRetentionDays).toBe(90);
    expect(updated.pacProxy).toBe(before.pacProxy);
    expect(getSettings(db)).toEqual(updated);
  });

  test("normalizes list whitespace and invalid timezone when reading persisted settings", () => {
    const db = setup();
    updateSettings(db, {
      directList: [" example.com ", "", "intranet.local"],
      timezone: "Definitely/Not_A_Timezone",
    });

    const settings = getSettings(db);
    expect(settings.directList).toEqual(["example.com", "intranet.local"]);
    expect(settings.timezone).toBe("Asia/Shanghai");
  });

  test("returns newest logs first and decodes structured detail", () => {
    const db = setup();
    appendGenerationLog(db, true, "custom", "first", { count: 1, cached: false });
    appendGenerationLog(db, false, "remote", "second", { count: 2 }, "download failed");
    appendGenerationLog(db, true, "custom", "third", { count: 3 });

    const page = recentLogs(db, 2);
    expect(page.map((item) => item.result_code)).toEqual(["third", "second"]);
    expect(page[1]).toMatchObject({
      success: false,
      error: "download failed",
      detail: { count: 2 },
    });
    expect(recentLogs(db, 2, 0, page[1].id).map((item) => item.result_code)).toEqual(["first"]);
  });

  test("clamps unsafe pagination values instead of generating invalid SQL limits", () => {
    const db = setup();
    appendGenerationLog(db, true, "custom", "one");
    expect(recentLogs(db, -1000)).toHaveLength(1);
    expect(recentLogs(db, 100000)).toHaveLength(1);
    expect(recentLogs(db, 20, -100)).toHaveLength(1);
  });

  test("fails with a clear diagnostic when persisted JSON is corrupt", () => {
    const db = setup();
    db.query("UPDATE settings SET value = ? WHERE key = 'config'").run("{broken");
    expect(() => getSettings(db)).toThrow("Failed to read application settings");
  });
});
