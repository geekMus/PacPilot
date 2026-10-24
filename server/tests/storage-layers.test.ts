import { describe, expect, it, vi } from "vitest";
import { normalizeArtifactKey } from "../storage/artifact-key";
import { asAsyncRepository } from "../storage/async-repository";
import { createApplicationStorage } from "../storage/index";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { MemoryAdminCredentialRepository } from "../storage/memory/admin-credential-repository";
import { createMemoryArtifactRepository } from "../storage/memory/artifact-repository";
import { createMemoryNotificationRepository } from "../storage/memory/notification-repository";
import { createMemorySettingsRepository } from "../storage/memory/settings-repository";
import { clone, safeLimit } from "../storage/memory/utils";

describe("normalizeArtifactKey", () => {
  it("normalizes Windows separators and leading slashes", () => {
    expect(normalizeArtifactKey("a\\b\\c.json")).toBe("a/b/c.json");
    expect(normalizeArtifactKey("///a/b")).toBe("a/b");
    expect(normalizeArtifactKey("a/b")).toBe("a/b");
  });

  it("rejects empty keys and traversal segments", () => {
    expect(() => normalizeArtifactKey("")).toThrow(/safe relative path/);
    expect(() => normalizeArtifactKey("/")).toThrow(/safe relative path/);
    expect(() => normalizeArtifactKey("..")).toThrow(/safe relative path/);
    expect(() => normalizeArtifactKey("a/../b")).toThrow(/safe relative path/);
    expect(() => normalizeArtifactKey("./a")).toThrow(/safe relative path/);
  });

  it("allows dots inside a segment", () => {
    expect(normalizeArtifactKey("pac.rule-source.json")).toBe("pac.rule-source.json");
    expect(normalizeArtifactKey("a/.hidden/b")).toBe("a/.hidden/b");
  });
});

describe("asAsyncRepository", () => {
  it("promisifies every method", async () => {
    const repository = asAsyncRepository({
      value: 1,
      read: () => "data",
      fail: () => {
        throw new Error("boom");
      },
    });
    expect(repository.value).toBe(1);
    const result = repository.read();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe("data");
    await expect(repository.fail()).rejects.toThrow("boom");
  });

  it("preserves the receiver when calling methods", async () => {
    const repository = asAsyncRepository({
      count: 0,
      increment() {
        this.count += 1;
        return this.count;
      },
    });
    expect(await repository.increment()).toBe(1);
    expect(await repository.increment()).toBe(2);
    expect(repository.count).toBe(2);
  });

  it("runs the method asynchronously, not during the call", async () => {
    const spy = vi.fn(() => "done");
    const repository = asAsyncRepository({ run: spy });
    const promise = repository.run();
    expect(spy).not.toHaveBeenCalled();
    await promise;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("memory utils", () => {
  it("deep clones values", () => {
    const source = { nested: { list: [1, 2, 3] } };
    const copy = clone(source);
    expect(copy).toEqual(source);
    expect(copy.nested).not.toBe(source.nested);
    expect(copy.nested.list).not.toBe(source.nested.list);
  });

  it("clamps and floors the page size", () => {
    expect(safeLimit(undefined, 50)).toBe(50);
    expect(safeLimit(10, 50)).toBe(10);
    expect(safeLimit(10.9, 50)).toBe(10);
    expect(safeLimit(0, 50)).toBe(50);
    expect(safeLimit(-5, 50)).toBe(1);
    expect(safeLimit(1000, 50)).toBe(101);
    expect(safeLimit(1000, 50, 201)).toBe(201);
    expect(safeLimit(Number.NaN, 50)).toBe(50);
  });
});

describe("memory settings repository", () => {
  it("normalizes writes and merges patches", () => {
    const repository = createMemorySettingsRepository();
    expect(repository.get().timezone).toBe(DEFAULT_SETTINGS.timezone);

    repository.set({ ...DEFAULT_SETTINGS, timezone: "UTC", logRetentionDays: 7 });
    expect(repository.get()).toMatchObject({ timezone: "UTC", logRetentionDays: 7 });

    const updated = repository.update({ pacCompress: false });
    expect(updated.pacCompress).toBe(false);
    expect(updated.timezone).toBe("UTC");
    expect(repository.get().pacCompress).toBe(false);
  });

  it("normalizes invalid values on write", () => {
    const repository = createMemorySettingsRepository();
    repository.set({ ...DEFAULT_SETTINGS, timezone: "Nowhere/Nothing" });
    expect(repository.get().timezone).toBe(DEFAULT_SETTINGS.timezone);
  });

  it("returns a clone so callers cannot mutate internal state", () => {
    const repository = createMemorySettingsRepository();
    const settings = repository.get();
    settings.timezone = "UTC";
    expect(repository.get().timezone).toBe(DEFAULT_SETTINGS.timezone);
  });
});

describe("memory artifact repository", () => {
  it("writes strings and byte arrays", () => {
    const repository = createMemoryArtifactRepository();
    repository.write("a.txt", "hello");
    repository.write("b.bin", new Uint8Array([1, 2, 3]));

    expect(new TextDecoder().decode(repository.read("a.txt"))).toBe("hello");
    expect([...repository.read("b.bin")!]).toEqual([1, 2, 3]);
  });

  it("returns copies so callers cannot mutate stored bytes", () => {
    const repository = createMemoryArtifactRepository();
    repository.write("a.txt", "hello");
    const bytes = repository.read("a.txt")!;
    bytes[0] = 0;
    expect(new TextDecoder().decode(repository.read("a.txt"))).toBe("hello");
  });

  it("reports existence, size and modification time", () => {
    const repository = createMemoryArtifactRepository();
    expect(repository.exists("a.txt")).toBe(false);
    expect(repository.read("a.txt")).toBeUndefined();
    expect(repository.stat("a.txt")).toBeUndefined();

    repository.write("a.txt", "hello");
    expect(repository.exists("a.txt")).toBe(true);
    expect(repository.stat("a.txt")?.size).toBe(5);
    expect(repository.stat("a.txt")?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("lists keys sorted and filtered by prefix", () => {
    const repository = createMemoryArtifactRepository();
    repository.write("b.txt", "b");
    repository.write("a.txt", "a");
    repository.write("nested/c.txt", "c");

    expect(repository.list()).toEqual(["a.txt", "b.txt", "nested/c.txt"]);
    expect(repository.list("nested")).toEqual(["nested/c.txt"]);
    expect(repository.list("nested/")).toEqual(["nested/c.txt"]);
    expect(repository.list("missing")).toEqual([]);
  });

  it("sums the stored bytes", () => {
    const repository = createMemoryArtifactRepository();
    expect(repository.totalBytes()).toBe(0);
    repository.write("a.txt", "hello");
    repository.write("b.txt", "hi");
    expect(repository.totalBytes()).toBe(7);
  });

  it("deletes keys and clears the store", () => {
    const repository = createMemoryArtifactRepository();
    repository.write("a.txt", "a");
    expect(repository.delete("a.txt")).toBe(true);
    expect(repository.delete("a.txt")).toBe(false);
    expect(repository.exists("a.txt")).toBe(false);

    repository.write("b.txt", "b");
    repository.clear();
    expect(repository.list()).toEqual([]);
    expect(repository.totalBytes()).toBe(0);
  });
});

describe("memory notification repository", () => {
  it("starts from an empty document", () => {
    const repository = createMemoryNotificationRepository();
    expect(repository.get()).toEqual({
      schemaVersion: 1,
      legacyMigrated: false,
      channels: [],
      rules: [],
      events: [],
      deliveries: [],
    });
  });

  it("stores clones in both directions", () => {
    const repository = createMemoryNotificationRepository();
    const document = {
      schemaVersion: 1,
      legacyMigrated: true,
      channels: [],
      rules: [],
      events: [],
      deliveries: [],
    };
    repository.set(document);
    document.legacyMigrated = false;
    expect(repository.get().legacyMigrated).toBe(true);

    const read = repository.get();
    read.channels.push({ id: "x" } as never);
    expect(repository.get().channels).toEqual([]);
  });

  it("resets back to the empty document", () => {
    const repository = createMemoryNotificationRepository();
    repository.set({
      schemaVersion: 1,
      legacyMigrated: true,
      channels: [],
      rules: [],
      events: [],
      deliveries: [],
    });
    repository.reset();
    expect(repository.get().legacyMigrated).toBe(false);
  });
});

describe("memory admin credential repository", () => {
  it("stores a single clone-protected record", () => {
    const repository = new MemoryAdminCredentialRepository();
    expect(repository.get()).toBeNull();

    const record = { passwordHash: "hash", salt: "salt", sessionSecret: "secret" };
    repository.set(record);
    record.sessionSecret = "mutated";
    expect(repository.get()).toEqual({
      passwordHash: "hash",
      salt: "salt",
      sessionSecret: "secret",
    });

    const read = repository.get()!;
    read.passwordHash = "mutated";
    expect(repository.get()!.passwordHash).toBe("hash");
  });

  it("clears the record", () => {
    const repository = new MemoryAdminCredentialRepository();
    repository.set({ passwordHash: "h", salt: "s", sessionSecret: "x" });
    repository.clear();
    expect(repository.get()).toBeNull();
  });
});

describe("createApplicationStorage", () => {
  it("returns the memory adapter for the memory driver", async () => {
    const storage = await createApplicationStorage({ storageDriver: "memory", dataDir: "" });
    expect(storage.driver).toBe("memory");
    expect(typeof storage.maintenance.databaseBytes).toBe("function");
    await storage.close();
  });

  it("rejects when the SQLite adapter cannot be loaded", async () => {
    // The SQLite adapter imports `bun:sqlite`, which the Node-based Vitest runner cannot
    // resolve. The real adapter is exercised by server/tests/storage-sqlite.bun.ts.
    await expect(
      createApplicationStorage({ storageDriver: "sqlite", dataDir: ":memory:" })
    ).rejects.toThrow(/bun:sqlite/);
  });
});
