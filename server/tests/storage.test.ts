import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemoryApplicationStorage } from "../storage/memory-application";
import { createSqliteApplicationStorage } from "../storage/sqlite/repositories";
import { createDatabase } from "../storage/sqlite/sqlite";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("memory storage adapter", () => {
  it("keeps application repositories isolated and clears volatile state on close", () => {
    const storage = createMemoryApplicationStorage();
    expect(storage.driver).toBe("memory");

    storage.settings.update({ timezone: "UTC" });
    storage.credentials.set({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    storage.generationLogs.append(true, "custom", "custom.uncompressed", { compressed: false });
    storage.monitoring.record({
      created_at: new Date().toISOString(),
      method: "GET",
      path: "/proxy.pac",
      category: "pac",
      source_ip: "127.0.0.1",
      user_agent: "test",
      status_code: 200,
      duration_ms: 3,
      response_bytes: 10,
      query_string: "",
      host: "localhost",
      referer: "",
      accept: "*/*",
      accept_language: "en",
      content_type: "",
      request_headers: "{}",
      response_content_type: "text/plain",
    });
    const workflowId = storage.workflows.create("manual", "custom");
    storage.artifacts.write("proxy.pac", "PAC");

    expect(storage.settings.get().timezone).toBe("UTC");
    expect(storage.credentials.get()?.sessionSecret).toBe("secret");
    expect(storage.generationLogs.count()).toBe(1);
    expect(storage.monitoring.count()).toBe(1);
    expect(storage.workflows.get(workflowId)?.status).toBe("pending");
    expect(new TextDecoder().decode(storage.artifacts.read("proxy.pac"))).toBe("PAC");
    expect(storage.maintenance.databaseBytes()).toBe(0);

    storage.close();
    expect(storage.settings.get().timezone).toBe("Asia/Shanghai");
    expect(storage.credentials.get()).toBeNull();
    expect(storage.generationLogs.count()).toBe(0);
    expect(storage.monitoring.count()).toBe(0);
    expect(storage.workflows.count()).toBe(0);
    expect(storage.artifacts.exists("proxy.pac")).toBe(false);
  });

  it("creates independent state for each application instance", () => {
    const first = createMemoryApplicationStorage();
    first.settings.update({ timezone: "UTC" });
    first.artifacts.write("proxy.pac", "PAC");

    const second = createMemoryApplicationStorage();
    expect(second.settings.get().timezone).toBe("Asia/Shanghai");
    expect(second.artifacts.exists("proxy.pac")).toBe(false);

    first.close();
    second.close();
  });
});

describe("SQLite storage adapter", () => {
  it("implements the same repository contracts with SQLite and filesystem artifacts", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-storage-"));
    temporaryDirectories.push(dataDir);
    const database = createDatabase(":memory:");
    const storage = createSqliteApplicationStorage(database, dataDir);

    storage.settings.update({ timezone: "UTC" });
    storage.credentials.set({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    storage.generationLogs.append(true, "custom", "custom.uncompressed", { compressed: false });
    const workflowId = storage.workflows.create("manual", "custom");
    storage.artifacts.write("proxy.pac", "PAC");

    expect(storage.driver).toBe("sqlite");
    expect(storage.settings.get().timezone).toBe("UTC");
    expect(storage.credentials.get()?.sessionSecret).toBe("secret");
    expect(storage.generationLogs.count()).toBe(1);
    expect(storage.workflows.get(workflowId)?.status).toBe("pending");
    expect(new TextDecoder().decode(storage.artifacts.read("proxy.pac"))).toBe("PAC");
    expect(storage.artifacts.list()).toContain("proxy.pac");

    storage.close();
  });
});
