import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFilesystemArtifactRepository } from "../storage/filesystem/artifact-repository";

let dataDir = "";

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-artifacts-"));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("createFilesystemArtifactRepository", () => {
  it("writes and reads bytes", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    repository.write("a.txt", "hello");
    repository.write("nested/b.bin", new Uint8Array([1, 2, 3]));

    expect(new TextDecoder().decode(repository.read("a.txt")!)).toBe("hello");
    expect([...repository.read("nested/b.bin")!]).toEqual([1, 2, 3]);
    expect(repository.read("missing.txt")).toBeUndefined();
  });

  it("creates parent directories on write", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    repository.write("deep/nested/dir/file.txt", "x");
    expect(fs.existsSync(path.join(dataDir, "deep/nested/dir/file.txt"))).toBe(true);
  });

  it("rejects traversal keys", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    expect(() => repository.write("../escape.txt", "x")).toThrow(/safe relative path/);
    expect(() => repository.read("../escape.txt")).toThrow(/safe relative path/);
  });

  it("reports existence and file stats", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    expect(repository.exists("a.txt")).toBe(false);
    expect(repository.stat("a.txt")).toBeUndefined();

    repository.write("a.txt", "hello");
    expect(repository.exists("a.txt")).toBe(true);
    expect(repository.stat("a.txt")?.size).toBe(5);
    expect(repository.stat("a.txt")?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns undefined for a directory path", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    fs.mkdirSync(path.join(dataDir, "folder"), { recursive: true });
    expect(repository.exists("folder")).toBe(false);
    expect(repository.stat("folder")).toBeUndefined();
  });

  it("deletes files and reports missing keys", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    repository.write("a.txt", "x");
    expect(repository.delete("a.txt")).toBe(true);
    expect(repository.delete("a.txt")).toBe(false);
  });

  it("rethrows unexpected read and delete failures", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    repository.write("a.txt", "x");

    vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    });
    expect(() => repository.read("a.txt")).toThrow(/permission denied/);

    vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("busy"), { code: "EBUSY" });
    });
    expect(() => repository.delete("a.txt")).toThrow(/busy/);
  });

  it("lists every file sorted and filtered by prefix", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    repository.write("b.txt", "b");
    repository.write("a.txt", "a");
    repository.write("nested/c.txt", "c");

    expect(repository.list()).toEqual(["a.txt", "b.txt", "nested/c.txt"]);
    expect(repository.list("nested")).toEqual(["nested/c.txt"]);
    expect(repository.list("missing")).toEqual([]);
  });

  it("skips symlinks while listing", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    repository.write("real.txt", "x");
    try {
      fs.symlinkSync(path.join(dataDir, "real.txt"), path.join(dataDir, "link.txt"));
    } catch {
      return; // symlinks may be unavailable (e.g. Windows without privileges)
    }

    expect(repository.list()).toEqual(["real.txt"]);
    expect(repository.totalBytes()).toBe(1);
  });

  it("returns an empty list for a missing data directory", () => {
    const repository = createFilesystemArtifactRepository(path.join(dataDir, "missing"));
    expect(repository.list()).toEqual([]);
    expect(repository.totalBytes()).toBe(0);
  });

  it("sums every stored byte", () => {
    const repository = createFilesystemArtifactRepository(dataDir);
    expect(repository.totalBytes()).toBe(0);
    repository.write("a.txt", "hello");
    repository.write("nested/b.txt", "hi");
    expect(repository.totalBytes()).toBe(7);
  });
});
