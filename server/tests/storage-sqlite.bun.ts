import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";
import { createSqliteApplicationStorage } from "../storage/sqlite/application-storage";
import { closeDb, createDatabase, getDb } from "../storage/sqlite/database";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite storage adapter", () => {
  test("implements the repository contracts and preserves binary artifacts", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-"));
    temporaryDirectories.push(dataDir);
    const database = createDatabase(":memory:");
    const storage = createSqliteApplicationStorage(database, dataDir);
    const memoryStorage = createMemoryApplicationStorage();

    await storage.settings.update({ timezone: "UTC" });
    await memoryStorage.settings.update({ timezone: "UTC" });
    expect(await storage.settings.get()).toEqual(await memoryStorage.settings.get());
    await storage.credentials.set({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    const workflowId = await storage.workflows.create("manual", "custom");
    await storage.artifacts.write("proxy.pac", "PAC");
    await storage.artifacts.write("binary.bin", new Uint8Array([0, 255, 1]));

    expect(storage.driver).toBe("sqlite");
    expect((await storage.credentials.get())?.sessionSecret).toBe("secret");
    expect((await storage.workflows.get(workflowId))?.status).toBe("pending");
    expect(new TextDecoder().decode(await storage.artifacts.read("proxy.pac"))).toBe("PAC");
    expect(await storage.artifacts.list()).toContain("proxy.pac");
    expect(Array.from((await storage.artifacts.read("binary.bin")) ?? [])).toEqual([0, 255, 1]);

    await storage.close();
    memoryStorage.close();
  });

  test("rejects a memory path so memory mode cannot initialize SQLite accidentally", () => {
    const database = createDatabase(":memory:");
    expect(() => createSqliteApplicationStorage(database, ":memory:")).toThrow(/memory adapter/);
    database.close();
  });
  test("releases the cached connection on close and can reopen the same data directory", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-lifecycle-"));
    temporaryDirectories.push(dataDir);
    const first = getDb(dataDir);
    const storage = createSqliteApplicationStorage(first, dataDir);
    await storage.close();

    const second = getDb(dataDir);
    expect(second).not.toBe(first);
    closeDb();
  });

  test("does not silently reuse a cached database for another data directory", () => {
    const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-first-"));
    const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-second-"));
    temporaryDirectories.push(firstDir, secondDir);
    getDb(firstDir);
    expect(() => getDb(secondDir)).toThrow(/different data directory/);
    closeDb();
  });
  test("exposes Promise-based operations and allows only one concurrent workflow claim", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-claims-"));
    temporaryDirectories.push(dataDir);
    const storage = createSqliteApplicationStorage(getDb(dataDir), dataDir);
    const settingsPromise = storage.settings.get();
    expect(settingsPromise).toBeInstanceOf(Promise);
    await settingsPromise;

    const workflowId = await storage.workflows.create("manual", "custom");
    const claims = await Promise.all([
      storage.workflows.claim(workflowId, "2026-10-23T10:00:00.000Z"),
      storage.workflows.claim(workflowId, "2026-10-23T10:00:01.000Z"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await storage.close();
  });
});
