import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationStorage } from "../storage/repositories";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";
import {
  clearRenderedPac,
  clearRuleSource,
  invalidateRenderedPac,
  readRenderedPac,
  readRuleSource,
  withPacBuildLock,
  writeRenderedPac,
  writeRuleSource,
  type PacRuleSource,
  type RenderedPac,
} from "../services/pac-runtime";

function source(overrides: Partial<PacRuleSource> = {}): PacRuleSource {
  return {
    fetchedAt: "2026-10-25T00:00:00.000Z",
    url: "https://example.com/gfwlist.txt",
    format: "gfwlist-base64",
    proxyHosts: ["a.example", "b.example"],
    directHosts: ["c.example"],
    ...overrides,
  };
}

async function storage(): Promise<ApplicationStorage> {
  return createMemoryApplicationStorage();
}

afterEach(() => {
  invalidateRenderedPac();
  vi.restoreAllMocks();
});

describe("rule source snapshot", () => {
  it("returns null when nothing has been written", async () => {
    const app = await storage();
    expect(await readRuleSource(app)).toBeNull();
    await app.close();
  });

  it("round-trips a snapshot through the artifact store", async () => {
    const app = await storage();
    const snapshot = source();
    await writeRuleSource(app, snapshot);
    expect(await readRuleSource(app)).toEqual(snapshot);
    await app.close();
  });

  it("returns null for unparsable JSON", async () => {
    const app = await storage();
    await app.artifacts.write("pac.rule-source.json", "{not json");
    expect(await readRuleSource(app)).toBeNull();
    await app.close();
  });

  it("returns null when the host lists are missing", async () => {
    const app = await storage();
    await app.artifacts.write("pac.rule-source.json", JSON.stringify({ fetchedAt: "x" }));
    expect(await readRuleSource(app)).toBeNull();

    await app.artifacts.write(
      "pac.rule-source.json",
      JSON.stringify({ proxyHosts: [], directHosts: "nope" })
    );
    expect(await readRuleSource(app)).toBeNull();
    await app.close();
  });

  it("returns null when the artifact read throws", async () => {
    const app = await storage();
    vi.spyOn(app.artifacts, "read").mockRejectedValueOnce(new Error("disk gone"));
    expect(await readRuleSource(app)).toBeNull();
    await app.close();
  });

  it("clears the snapshot", async () => {
    const app = await storage();
    await writeRuleSource(app, source());
    await clearRuleSource(app);
    expect(await readRuleSource(app)).toBeNull();
    await app.close();
  });

  it("swallows delete failures", async () => {
    const app = await storage();
    vi.spyOn(app.artifacts, "delete").mockRejectedValueOnce(new Error("read-only"));
    await expect(clearRuleSource(app)).resolves.toBeUndefined();
    await app.close();
  });
});

function rendered(overrides: Partial<RenderedPac> = {}): RenderedPac {
  return {
    body: "function FindProxyForURL(url, host) { return 'DIRECT'; }",
    source: "function FindProxyForURL(url, host) { return 'DIRECT'; }",
    etag: '"abc"',
    builtAt: "2026-10-31T00:00:00.000Z",
    sourceVersion: "deadbeefdeadbeefdeadbeefdeadbeef",
    stale: false,
    compressed: false,
    obfuscated: false,
    ...overrides,
  };
}

describe("rendered PAC persistence", () => {
  it("round-trips a rendered entry through the artifact store", async () => {
    const app = await storage();
    const value = rendered();
    await writeRenderedPac(app, value);
    expect(await readRenderedPac(app)).toEqual(value);
    await app.close();
  });

  it("returns null when nothing has been persisted", async () => {
    const app = await storage();
    expect(await readRenderedPac(app)).toBeNull();
    await app.close();
  });

  it("returns null for unparsable or incomplete payloads", async () => {
    const app = await storage();
    await app.artifacts.write("pac.rendered.json", "{not json");
    expect(await readRenderedPac(app)).toBeNull();

    await app.artifacts.write("pac.rendered.json", JSON.stringify({ body: "x" }));
    expect(await readRenderedPac(app)).toBeNull();
    await app.close();
  });

  it("returns null when the artifact read throws", async () => {
    const app = await storage();
    vi.spyOn(app.artifacts, "read").mockRejectedValueOnce(new Error("disk gone"));
    expect(await readRenderedPac(app)).toBeNull();
    await app.close();
  });

  it("swallows write failures", async () => {
    const app = await storage();
    vi.spyOn(app.artifacts, "write").mockRejectedValueOnce(new Error("disk gone"));
    await expect(writeRenderedPac(app, rendered())).resolves.toBeUndefined();
    await app.close();
  });

  it("clears the persisted render and swallows delete failures", async () => {
    const app = await storage();
    await writeRenderedPac(app, rendered());
    await clearRenderedPac(app);
    expect(await readRenderedPac(app)).toBeNull();

    vi.spyOn(app.artifacts, "delete").mockRejectedValueOnce(new Error("read-only"));
    await expect(clearRenderedPac(app)).resolves.toBeUndefined();
    await app.close();
  });
});

describe("withPacBuildLock", () => {
  it("collapses concurrent rebuilds into one execution", async () => {
    const build = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "rendered";
    });

    const [first, second, third] = await Promise.all([
      withPacBuildLock(build),
      withPacBuildLock(build),
      withPacBuildLock(build),
    ]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(first).toBe("rendered");
    expect(second).toBe("rendered");
    expect(third).toBe("rendered");
  });

  it("runs a fresh build after the previous one settles", async () => {
    const build = vi.fn(async () => "rendered");
    await withPacBuildLock(build);
    await withPacBuildLock(build);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("releases the lock when the build rejects", async () => {
    const failing = vi.fn(async () => {
      throw new Error("render failed");
    });
    await expect(withPacBuildLock(failing)).rejects.toThrow("render failed");

    const succeeding = vi.fn(async () => "recovered");
    await expect(withPacBuildLock(succeeding)).resolves.toBe("recovered");
  });
});
