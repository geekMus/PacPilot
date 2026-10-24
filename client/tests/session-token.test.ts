import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_KEY = "pacpilot.adminToken";
const EXPIRES_KEY = "pacpilot.adminTokenExpiresAt";

describe("session token storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("returns an empty string when nothing was stored", async () => {
    const { readSessionToken } = await import("../src/api/session-token");
    expect(readSessionToken()).toBe("");
  });

  it("round-trips a saved token", async () => {
    const { readSessionToken, saveSessionToken } = await import("../src/api/session-token");
    saveSessionToken("abc123", Date.now() + 60_000);

    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("abc123");
    expect(readSessionToken()).toBe("abc123");
  });

  it("ignores a save without a token", async () => {
    const { saveSessionToken } = await import("../src/api/session-token");
    saveSessionToken(undefined, Date.now() + 60_000);
    saveSessionToken("", Date.now() + 60_000);

    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("drops the expiry entry when no finite expiry is provided", async () => {
    const { saveSessionToken } = await import("../src/api/session-token");
    window.localStorage.setItem(EXPIRES_KEY, "999");

    saveSessionToken("abc123");
    expect(window.localStorage.getItem(EXPIRES_KEY)).toBeNull();

    window.localStorage.setItem(EXPIRES_KEY, "999");
    saveSessionToken("abc123", Number.NaN);
    expect(window.localStorage.getItem(EXPIRES_KEY)).toBeNull();
  });

  it("treats an expired token as absent and clears it", async () => {
    const { readSessionToken, saveSessionToken } = await import("../src/api/session-token");
    saveSessionToken("stale", Date.now() - 1_000);

    expect(readSessionToken()).toBe("");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(EXPIRES_KEY)).toBeNull();
  });

  it("keeps a token without any expiry information", async () => {
    const { readSessionToken } = await import("../src/api/session-token");
    window.localStorage.setItem(TOKEN_KEY, "forever");

    expect(readSessionToken()).toBe("forever");
  });

  it("clears both keys", async () => {
    const { clearSessionToken, readSessionToken, saveSessionToken } =
      await import("../src/api/session-token");
    saveSessionToken("abc123", Date.now() + 60_000);
    clearSessionToken();

    expect(readSessionToken()).toBe("");
    expect(window.localStorage.getItem(EXPIRES_KEY)).toBeNull();
  });

  it("degrades gracefully when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked by policy");
      },
    });

    const { clearSessionToken, readSessionToken, saveSessionToken } =
      await import("../src/api/session-token");

    expect(readSessionToken()).toBe("");
    expect(() => saveSessionToken("abc123", Date.now() + 60_000)).not.toThrow();
    expect(() => clearSessionToken()).not.toThrow();
  });
});
