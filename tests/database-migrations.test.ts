import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../server/db/sqlite";
import type { AppDatabase } from "../server/db/sqlite";

let database: AppDatabase | null = null;
let tempDir: string | null = null;

afterEach(() => {
  database?.close();
  database = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("SQLite schema migration", () => {
  test("migrates an unversioned legacy database without deleting settings or logs", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "genpac-migration-"));
    const dbPath = path.join(tempDir, "genpac.db");
    const legacy = new Database(dbPath);

    legacy.run(`
      CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO settings (key, value) VALUES ('config', '{}');

      CREATE TABLE generation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        success INTEGER NOT NULL,
        mode TEXT NOT NULL,
        result_code TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO generation_log (success, mode, result_code) VALUES (1, 'custom', 'legacy-success');
      PRAGMA user_version = 0;
    `);
    legacy.close();

    database = createDatabase(tempDir);

    const version = database.query("PRAGMA user_version").get() as { user_version: number };
    const log = database
      .query("SELECT id, result_code, detail, error FROM generation_log WHERE result_code = ?")
      .get("legacy-success") as {
      id: number;
      result_code: string;
      detail: string;
      error: string;
    } | null;
    const settings = database
      .query("SELECT value FROM settings WHERE key = 'config'")
      .get() as { value: string } | null;

    expect(version.user_version).toBe(2);
    expect(log).not.toBeNull();
    expect(log?.id).toBe(1);
    expect(log?.detail).toBe("{}");
    expect(log?.error).toBe("");
    expect(settings).not.toBeNull();
    expect(() => database?.query("SELECT * FROM workflow_stages").all()).not.toThrow();
  });

  test("rejects a future schema version instead of silently downgrading it", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "genpac-future-schema-"));
    const dbPath = path.join(tempDir, "genpac.db");
    const future = new Database(dbPath);
    future.run("CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version = 99;");
    future.close();

    expect(() => createDatabase(tempDir!)).toThrow("Unsupported database schema version: 99");
  });
});
