import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { closeDb, getDb } from "../storage/sqlite/database";
import { BASELINE_SCHEMA_VERSION } from "../storage/sqlite/schema";
import {
  SQLITE_MIGRATIONS,
  ensureSchema,
  type SqliteMigration,
} from "../storage/sqlite/migrations";
import { createMigrationBackup } from "../storage/sqlite/backup";
import { DEFAULT_SETTINGS, normalizeAppSettings } from "../domain/settings";

const LATEST_SCHEMA_VERSION = SQLITE_MIGRATIONS[SQLITE_MIGRATIONS.length - 1]!.version;

const temporaryDirectories: string[] = [];
afterEach(() => {
  closeDb();
  for (const directory of temporaryDirectories.splice(0)) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      /* Windows may keep the SQLite file handle briefly after close. */
    }
  }
});

function temporaryDataDir(prefix: string): string {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(dataDir);
  return dataDir;
}

function readVersion(database: Database): number {
  return Number(
    (database.query("PRAGMA user_version").get() as { user_version: number }).user_version
  );
}

function notificationsRow(database: Database): { value: string } | null {
  return database.query("SELECT value FROM settings WHERE key = ?").get("notifications") as {
    value: string;
  } | null;
}

/** The notifications document shape as persisted by pre-v5 releases. */
const LEGACY_NOTIFICATIONS = JSON.stringify({
  schemaVersion: 1,
  channels: [
    {
      id: "channel-1",
      name: "Ops",
      provider: "custom",
      enabled: true,
      config: {
        provider: "custom",
        url: "https://example.test/hook",
        method: "POST",
        headers: "{}",
        body: "",
        dingTalkSecret: "",
        dingTalkMessageType: "text",
        testBody: "",
        messageTemplate: "",
        testMessageTemplate: "",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  rules: [],
  events: [
    {
      id: "event-1",
      type: "system.error",
      phase: "state_changed",
      subject: { type: "system", id: "pacpilot" },
      occurredAt: "2026-01-01T00:00:00.000Z",
      correlationId: "corr-1",
      schemaVersion: 1,
    },
  ],
  deliveries: [],
});

/**
 * Builds a genuine baseline database by running only the baseline migration,
 * then optionally seeding a legacy notifications row — the state a pre-v5
 * deployment would hand to a newer build.
 */
function createLegacyDatabase(dataDir: string, notificationsValue: string | null): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const database = new Database(path.join(dataDir, "database.db"), { create: true });
  database.run("PRAGMA journal_mode = WAL;");
  database.run("PRAGMA foreign_keys = ON;");
  ensureSchema(database, {
    dataDir,
    ensureDefaultSettings: () => {
      const normalized = normalizeAppSettings(DEFAULT_SETTINGS);
      database
        .query("INSERT INTO settings (key, value) VALUES ('config', ?)")
        .run(JSON.stringify(normalized));
    },
    migrations: SQLITE_MIGRATIONS.filter(
      (migration) => migration.version <= BASELINE_SCHEMA_VERSION
    ),
  });
  if (notificationsValue !== null) {
    database
      .query("INSERT INTO settings (key, value) VALUES ('notifications', ?)")
      .run(notificationsValue);
  }
  database.close();
}

describe("SQLite schema migrations", () => {
  test("the migration chain is contiguous and starts at the v4 baseline", () => {
    expect(SQLITE_MIGRATIONS[0]!.version).toBe(4);
    for (let index = 1; index < SQLITE_MIGRATIONS.length; index += 1) {
      expect(SQLITE_MIGRATIONS[index]!.version).toBe(SQLITE_MIGRATIONS[index - 1]!.version + 1);
    }
    expect(SQLITE_MIGRATIONS.length).toBe(LATEST_SCHEMA_VERSION - BASELINE_SCHEMA_VERSION + 1);
  });

  test("a fresh data directory replays the whole chain and writes default settings", () => {
    const dataDir = temporaryDataDir("pacpilot-migrations-fresh-");
    const database = getDb(dataDir);
    expect(readVersion(database)).toBe(LATEST_SCHEMA_VERSION);
    expect(
      database
        .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workflow_stages'")
        .get()
    ).toBeTruthy();
    const config = database.query("SELECT value FROM settings WHERE key = 'config'").get() as {
      value: string;
    };
    expect(JSON.parse(config.value).mode).toBe("custom");
    // Fresh installs never create a migration backup.
    expect(fs.existsSync(path.join(dataDir, "backups"))).toBe(false);
  });

  test("upgrades a baseline database, strips schemaVersion fields, and backs up first", () => {
    const dataDir = temporaryDataDir("pacpilot-migrations-upgrade-");
    createLegacyDatabase(dataDir, LEGACY_NOTIFICATIONS);

    const database = getDb(dataDir);
    expect(readVersion(database)).toBe(LATEST_SCHEMA_VERSION);

    const row = notificationsRow(database);
    expect(row).not.toBeNull();
    const document = JSON.parse(row!.value);
    expect(document.schemaVersion).toBeUndefined();
    expect(document.events[0].schemaVersion).toBeUndefined();
    expect(document.events[0].id).toBe("event-1");
    expect(document.channels).toHaveLength(1);
    expect(document.channels[0].name).toBe("Ops");
    const config = database.query("SELECT value FROM settings WHERE key = 'config'").get() as {
      value: string;
    };
    expect(JSON.parse(config.value).mode).toBe("custom");

    // The backup is a self-contained snapshot of the pre-migration database.
    const backups = fs.readdirSync(path.join(dataDir, "backups"));
    expect(backups).toHaveLength(1);
    const backupDatabase = new Database(path.join(dataDir, "backups", backups[0]!), {
      readonly: true,
    });
    try {
      expect(readVersion(backupDatabase)).toBe(BASELINE_SCHEMA_VERSION);
      const backupRow = notificationsRow(backupDatabase);
      expect(JSON.parse(backupRow!.value).schemaVersion).toBe(1);
      expect(JSON.parse(backupRow!.value).events[0].schemaVersion).toBe(1);
    } finally {
      backupDatabase.close();
    }
  });

  test("a fresh install and an upgraded database end up structurally identical", () => {
    const freshDir = temporaryDataDir("pacpilot-migrations-equiv-fresh-");
    const upgradedDir = temporaryDataDir("pacpilot-migrations-equiv-upgrade-");
    createLegacyDatabase(upgradedDir, LEGACY_NOTIFICATIONS);
    getDb(freshDir);
    closeDb();
    getDb(upgradedDir);
    closeDb();

    const dump = (dir: string) => {
      const database = new Database(path.join(dir, "database.db"), { readonly: true });
      try {
        return {
          version: readVersion(database),
          schema: database
            .query(
              "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
            )
            .all(),
        };
      } finally {
        database.close();
      }
    };
    expect(dump(upgradedDir)).toEqual(dump(freshDir));
  });

  test("a failing migration rolls back atomically and points at the pre-migration backup", () => {
    const dataDir = temporaryDataDir("pacpilot-migrations-failure-");
    createLegacyDatabase(dataDir, LEGACY_NOTIFICATIONS);

    const failing: SqliteMigration = {
      version: LATEST_SCHEMA_VERSION,
      description: "always fails",
      up() {
        throw new Error("boom");
      },
    };
    const database = new Database(path.join(dataDir, "database.db"), { create: true });
    try {
      expect(() =>
        ensureSchema(database, {
          dataDir,
          ensureDefaultSettings: () => {},
          migrations: [SQLITE_MIGRATIONS[0]!, failing],
        })
      ).toThrow(/pre-migration backup is available at/);
      expect(readVersion(database)).toBe(BASELINE_SCHEMA_VERSION);
      expect(JSON.parse(notificationsRow(database)!.value).schemaVersion).toBe(1);
    } finally {
      database.close();
    }
  });

  test("aborts on a corrupt notifications record instead of dropping data", () => {
    const dataDir = temporaryDataDir("pacpilot-migrations-corrupt-");
    createLegacyDatabase(dataDir, "{not-valid-json");

    expect(() => getDb(dataDir)).toThrow(/not valid JSON/);
    const database = new Database(path.join(dataDir, "database.db"), { create: true });
    try {
      expect(readVersion(database)).toBe(BASELINE_SCHEMA_VERSION);
      expect(notificationsRow(database)!.value).toBe("{not-valid-json");
      expect(fs.readdirSync(path.join(dataDir, "backups")).length).toBe(1);
    } finally {
      database.close();
    }
  });

  test("refuses to start against a database from a newer build", () => {
    const dataDir = temporaryDataDir("pacpilot-migrations-newer-");
    getDb(dataDir);
    closeDb();
    const database = new Database(path.join(dataDir, "database.db"), { create: true });
    database.run(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1};`);
    database.close();
    expect(() => getDb(dataDir)).toThrow(/newer than this build supports/);
  });

  test("refuses to start against pre-baseline schema versions", () => {
    for (const version of [1, 2, 3]) {
      const dataDir = temporaryDataDir(`pacpilot-migrations-old-v${version}-`);
      createLegacyDatabase(dataDir, null);
      const database = new Database(path.join(dataDir, "database.db"), { create: true });
      database.run(`PRAGMA user_version = ${version};`);
      database.close();
      expect(() => getDb(dataDir)).toThrow(/older than the minimum supported baseline/);
    }
  });

  test("refuses databases with inconsistent version and table state", () => {
    const untrackedDir = temporaryDataDir("pacpilot-migrations-untracked-");
    createLegacyDatabase(untrackedDir, null);
    let database = new Database(path.join(untrackedDir, "database.db"), { create: true });
    database.run("PRAGMA user_version = 0;");
    database.close();
    expect(() => getDb(untrackedDir)).toThrow(/predates schema versioning/);

    const missingTablesDir = temporaryDataDir("pacpilot-migrations-missing-tables-");
    database = new Database(path.join(missingTablesDir, "database.db"), { create: true });
    database.run(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
    database.close();
    expect(() => getDb(missingTablesDir)).toThrow(/settings table is missing/);
  });

  test("keeps only the five most recent migration backups", () => {
    const dataDir = temporaryDataDir("pacpilot-migrations-backups-");
    const database = new Database(path.join(dataDir, "database.db"), { create: true });
    try {
      for (let index = 0; index < 7; index += 1) {
        createMigrationBackup(database, dataDir, LATEST_SCHEMA_VERSION);
      }
      const backups = fs
        .readdirSync(path.join(dataDir, "backups"))
        .filter((name) => name.endsWith(".db"));
      expect(backups).toHaveLength(5);
    } finally {
      database.close();
    }
  });
});
