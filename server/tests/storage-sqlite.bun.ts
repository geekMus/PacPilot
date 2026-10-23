import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemoryApplicationStorage } from "../storage/memory-application";
import { createSqliteApplicationStorage } from "../storage/sqlite/repositories";
import { createDatabase } from "../storage/sqlite/database";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite storage adapter", () => {
  test("implements the repository contracts and preserves binary artifacts", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-"));
    temporaryDirectories.push(dataDir);
    const database = createDatabase(":memory:");
    const storage = createSqliteApplicationStorage(database, dataDir);
    const memoryStorage = createMemoryApplicationStorage();

    storage.settings.update({ timezone: "UTC" });
    memoryStorage.settings.update({ timezone: "UTC" });
    expect(storage.settings.get()).toEqual(memoryStorage.settings.get());
    storage.credentials.set({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    storage.generationLogs.append(true, "custom", "custom.uncompressed", { compressed: false });
    const workflowId = storage.workflows.create("manual", "custom");
    storage.artifacts.write("proxy.pac", "PAC");
    storage.artifacts.write("binary.bin", new Uint8Array([0, 255, 1]));

    expect(storage.driver).toBe("sqlite");
    expect(storage.credentials.get()?.sessionSecret).toBe("secret");
    expect(storage.generationLogs.count()).toBe(1);
    expect(storage.workflows.get(workflowId)?.status).toBe("pending");
    expect(new TextDecoder().decode(storage.artifacts.read("proxy.pac"))).toBe("PAC");
    expect(storage.artifacts.list()).toContain("proxy.pac");
    expect(Array.from(storage.artifacts.read("binary.bin") ?? [])).toEqual([0, 255, 1]);

    storage.close();
    memoryStorage.close();
  });

  test("rejects a memory path so memory mode cannot initialize SQLite accidentally", () => {
    const database = createDatabase(":memory:");
    expect(() => createSqliteApplicationStorage(database, ":memory:")).toThrow(/memory adapter/);
    database.close();
  });
});
