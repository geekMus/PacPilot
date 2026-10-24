import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());

vi.mock("@/api/client", () => ({
  api: { session: session },
}));

async function loadSessionModule() {
  vi.resetModules();
  return await import("../src/composables/useAdminSession");
}

beforeEach(() => {
  session.mockReset();
  session.mockResolvedValue({ loggedIn: true, adminCredentialsMissing: false });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T02:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchAdminSession", () => {
  it("caches the session for the TTL window", async () => {
    const { fetchAdminSession } = await loadSessionModule();

    const first = await fetchAdminSession();
    const second = await fetchAdminSession();

    expect(session).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("re-fetches once the cache expires", async () => {
    const { fetchAdminSession } = await loadSessionModule();

    await fetchAdminSession();
    vi.setSystemTime(new Date("2026-10-25T02:00:03.000Z"));
    await fetchAdminSession();

    expect(session).toHaveBeenCalledTimes(2);
  });

  it("bypasses the cache when forced", async () => {
    const { fetchAdminSession } = await loadSessionModule();

    await fetchAdminSession();
    await fetchAdminSession(true);

    expect(session).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after the cache is invalidated", async () => {
    const { fetchAdminSession, invalidateAdminSessionCache } = await loadSessionModule();

    await fetchAdminSession();
    invalidateAdminSessionCache();
    await fetchAdminSession();

    expect(session).toHaveBeenCalledTimes(2);
  });
});

describe("isAdminAppRoute", () => {
  it("recognizes admin routes only", async () => {
    const { isAdminAppRoute } = await loadSessionModule();

    expect(isAdminAppRoute("/admin")).toBe(true);
    expect(isAdminAppRoute("/admin/dashboard")).toBe(true);
    expect(isAdminAppRoute("/")).toBe(false);
    expect(isAdminAppRoute("/administrator")).toBe(false);
    expect(isAdminAppRoute("/pac")).toBe(false);
  });
});
