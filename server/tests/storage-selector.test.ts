import { describe, expect, it, vi } from "vitest";

/**
 * The SQLite adapter lives behind dynamic imports so database-free deployments never
 * load `bun:sqlite`. These tests pin the selection logic without touching the driver.
 */
describe("createApplicationStorage", () => {
  it("returns the in-memory adapter for the memory driver", async () => {
    vi.resetModules();
    const { createApplicationStorage } = await import("../storage/index");
    const storage = await createApplicationStorage({ storageDriver: "memory", dataDir: "/tmp/x" });

    expect(storage.driver).toBe("memory");
    await storage.close();
  });

  it("delegates to the sqlite adapter for the sqlite driver", async () => {
    vi.resetModules();
    vi.doMock("../storage/sqlite/database", () => ({ getDb: vi.fn(() => ({ tag: "db" })) }));
    vi.doMock("../storage/sqlite/application-storage", () => ({
      createSqliteApplicationStorage: vi.fn(() => ({ driver: "sqlite", closed: false })),
    }));

    const database = await import("../storage/sqlite/database");
    const application = await import("../storage/sqlite/application-storage");
    const { createApplicationStorage } = await import("../storage/index");

    const storage = await createApplicationStorage({ storageDriver: "sqlite", dataDir: "/tmp/db" });

    expect(database.getDb).toHaveBeenCalledWith("/tmp/db");
    expect(application.createSqliteApplicationStorage).toHaveBeenCalledWith(
      { tag: "db" },
      "/tmp/db"
    );
    expect(storage).toMatchObject({ driver: "sqlite" });

    vi.doUnmock("../storage/sqlite/database");
    vi.doUnmock("../storage/sqlite/application-storage");
    vi.resetModules();
  });
});
