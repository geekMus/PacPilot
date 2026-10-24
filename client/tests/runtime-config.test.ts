import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `runtime-config` keeps module-level state, so each case re-imports a fresh copy. */
describe("runtime config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.unstubAllEnvs?.();
  });

  it("defaults to same-origin when config.json is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    const { getApiBaseUrl, isCrossOriginApi, loadRuntimeConfig, resolveApiUrl } =
      await import("../src/api/runtime-config");

    await loadRuntimeConfig();

    expect(getApiBaseUrl()).toBe("");
    expect(isCrossOriginApi()).toBe(false);
    expect(resolveApiUrl("/api/meta")).toBe("/api/meta");
  });

  it("reads the backend origin from config.json and trims trailing slashes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ apiBaseUrl: "  https://api.example.com//  " }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { getApiBaseUrl, isCrossOriginApi, loadRuntimeConfig, resolveApiUrl } =
      await import("../src/api/runtime-config");

    await loadRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.objectContaining({ cache: "no-store", credentials: "omit" })
    );
    expect(getApiBaseUrl()).toBe("https://api.example.com");
    expect(isCrossOriginApi()).toBe(true);
    expect(resolveApiUrl("/api/meta")).toBe("https://api.example.com/api/meta");
    expect(resolveApiUrl("api/meta")).toBe("https://api.example.com/api/meta");
    expect(resolveApiUrl("http://other.example/x")).toBe("http://other.example/x");
  });

  it("keeps the default origin when config.json answers with a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ apiBaseUrl: "https://ignored" }) }))
    );
    const { getApiBaseUrl, loadRuntimeConfig } = await import("../src/api/runtime-config");

    await loadRuntimeConfig();

    expect(getApiBaseUrl()).toBe("");
  });

  it("normalizes an empty apiBaseUrl to same origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ apiBaseUrl: "   " }) }))
    );
    const { getApiBaseUrl, isCrossOriginApi, loadRuntimeConfig } =
      await import("../src/api/runtime-config");

    await loadRuntimeConfig();

    expect(getApiBaseUrl()).toBe("");
    expect(isCrossOriginApi()).toBe(false);
  });

  it("prefers the build-time VITE_API_BASE_URL over config.json", async () => {
    vi.stubEnv("VITE_API_BASE_URL", " https://build.example.com/ ");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getApiBaseUrl, loadRuntimeConfig } = await import("../src/api/runtime-config");

    await loadRuntimeConfig();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getApiBaseUrl()).toBe("https://build.example.com");
  });

  it("returns the last loaded config on repeated calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ apiBaseUrl: "https://api.example.com" }),
      }))
    );
    const { loadRuntimeConfig } = await import("../src/api/runtime-config");

    const first = await loadRuntimeConfig();
    const second = await loadRuntimeConfig();

    expect(first).toEqual({ apiBaseUrl: "https://api.example.com" });
    expect(second).toEqual(first);
  });
});
