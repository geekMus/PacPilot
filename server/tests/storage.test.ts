import { describe, expect, it } from "vitest";
import { createMemoryStorage, MemoryArtifactStorage, MemoryKeyValueStorage } from "../storage/memory";
import { clearEphemeralFiles, readEphemeralFile, statEphemeralFile, unlinkEphemeralFile, writeEphemeralFile } from "../storage/ephemeral-files";

describe("MemoryKeyValueStorage", () => {
  it("isolates values by namespace and key", async () => {
    const store = new MemoryKeyValueStorage();
    await store.set("settings", "config", { enabled: true });
    await store.set("auth", "config", { enabled: false });

    expect(await store.get("settings", "config")).toEqual({ enabled: true });
    expect(await store.get("auth", "config")).toEqual({ enabled: false });
    expect(await store.get("missing", "config")).toBeUndefined();
  });

  it("clones values to prevent mutations bypassing storage", async () => {
    const store = new MemoryKeyValueStorage();
    const input = { rules: ["example.com"] };
    await store.set("settings", "config", input);
    input.rules.push("mutated.example");
    const stored = await store.get<{ rules: string[] }>("settings", "config");
    stored?.rules.push("caller-mutated.example");

    expect(await store.get("settings", "config")).toEqual({ rules: ["example.com"] });
  });

  it("supports entries, deletion, and namespace clearing", async () => {
    const store = new MemoryKeyValueStorage();
    await store.set("logs", "1", { ok: true });
    await store.set("logs", "2", { ok: false });

    expect(await store.entries("logs")).toEqual([
      ["1", { ok: true }],
      ["2", { ok: false }],
    ]);
    expect(await store.delete("logs", "1")).toBe(true);
    expect(await store.clear("logs")).toBe(1);
    expect(await store.entries("logs")).toEqual([]);
  });
});

describe("MemoryArtifactStorage", () => {
  it("stores text and binary artifacts without sharing mutable buffers", async () => {
    const store = new MemoryArtifactStorage();
    await store.write("pac/output.pac", "DIRECT");
    await store.write("bin/data", new Uint8Array([1, 2, 3]));

    const bytes = await store.read("bin/data");
    bytes?.fill(0);
    expect(Array.from((await store.read("bin/data")) ?? [])).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode((await store.read("pac/output.pac"))!)).toBe("DIRECT");
  });

  it("lists by prefix and rejects path traversal", async () => {
    const store = new MemoryArtifactStorage();
    await store.write("pac/a.pac", "a");
    await store.write("pac/b.pac", "b");
    await store.write("logs/a.json", "{}");

    expect(await store.list("pac")).toEqual(["pac/a.pac", "pac/b.pac"]);
    await expect(store.write("../secret", "no")).rejects.toThrow(/relative path/);
  });

  it("clears process-local data when the storage context closes", async () => {
    const storage = createMemoryStorage();
    await storage.values.set("settings", "config", { mode: "custom" });
    await storage.artifacts.write("pac/output.pac", "DIRECT");

    await storage.close();
    expect(await storage.values.get("settings", "config")).toBeUndefined();
    expect(await storage.artifacts.exists("pac/output.pac")).toBe(false);
  });

  it("starts empty for each new storage context", async () => {
    const first = createMemoryStorage();
    await first.values.set("settings", "config", { mode: "custom" });
    await first.artifacts.write("pac/output.pac", "DIRECT");

    const second = createMemoryStorage();
    expect(await second.values.get("settings", "config")).toBeUndefined();
    expect(await second.artifacts.exists("pac/output.pac")).toBe(false);
  });
});


describe("ephemeral PAC artifact files", () => {
  it("keeps artifacts in process memory and supports read/stat/delete", () => {
    clearEphemeralFiles();
    const file = ":memory:/proxy.pac";
    writeEphemeralFile(file, "function FindProxyForURL(){return 'DIRECT';}");
    expect(readEphemeralFile(file)).toContain("FindProxyForURL");
    expect(statEphemeralFile(file).size).toBeGreaterThan(0);
    expect(statEphemeralFile(file).isFile()).toBe(true);
    unlinkEphemeralFile(file);
    expect(() => readEphemeralFile(file)).toThrow();
  });

  it("clears all temporary artifacts on shutdown", () => {
    clearEphemeralFiles();
    writeEphemeralFile(":memory:/proxy.pac", "PAC");
    writeEphemeralFile(":memory:/proxy.source.pac", "source");
    clearEphemeralFiles();
    expect(() => readEphemeralFile(":memory:/proxy.pac")).toThrow();
    expect(() => readEphemeralFile(":memory:/proxy.source.pac")).toThrow();
  });
});


describe("Admin credential repositories", () => {
  it("keeps memory credentials isolated and returns defensive copies", async () => {
    const { MemoryAdminCredentialRepository } = await import("../storage/memory-credentials");
    const store = new MemoryAdminCredentialRepository();
    const record = { passwordHash: "hash", salt: "salt", sessionSecret: "secret" };
    store.set(record);
    record.passwordHash = "mutated";
    expect(store.get()).toEqual({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    const copy = store.get();
    if (copy) copy.sessionSecret = "mutated";
    expect(store.get()?.sessionSecret).toBe("secret");
    store.clear();
    expect(store.get()).toBeNull();
  });
});


describe("MemoryApplicationStorage", () => {
  it("provides isolated domain repositories and clears volatile state on close", async () => {
    const { createMemoryApplicationStorage } = await import("../storage/memory-application");
    const storage = createMemoryApplicationStorage();
    expect(storage.driver).toBe("memory");

    storage.settings.update({ timezone: "UTC" });
    storage.credentials.set({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    storage.generationLogs.append(true, "custom", "custom.uncompressed", { compressed: false });
    storage.monitoring.record({
      created_at: new Date().toISOString(), method: "GET", path: "/proxy.pac", category: "pac",
      source_ip: "127.0.0.1", user_agent: "test", status_code: 200, duration_ms: 3,
      response_bytes: 10, query_string: "", host: "localhost", referer: "", accept: "*/*",
      accept_language: "en", content_type: "", request_headers: "{}", response_content_type: "text/plain",
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
    expect(storage.artifacts.read("proxy.pac")).toBeUndefined();
  });
});
