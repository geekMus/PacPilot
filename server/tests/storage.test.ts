import { describe, expect, it } from "vitest";
import { createMemoryStorage, MemoryArtifactStorage, MemoryKeyValueStorage } from "../storage/memory";

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
