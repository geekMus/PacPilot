import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchAdminSession,
  invalidateAdminSessionCache,
  isAdminAppRoute,
} from "../../client/src/composables/useAdminSession";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  invalidateAdminSessionCache();
});

describe("frontend admin-session cache", () => {
  test("reuses a fresh session response to avoid duplicate requests", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ loggedIn: true, adminCredentialsMissing: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const first = await fetchAdminSession();
    const second = await fetchAdminSession();

    expect(first).toEqual({ loggedIn: true, adminCredentialsMissing: false });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  test("expires cached sessions after the TTL and refreshes from the API", async () => {
    let now = 1_000;
    Date.now = () => now;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ loggedIn: calls > 1, adminCredentialsMissing: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    expect((await fetchAdminSession()).loggedIn).toBe(false);
    now += 2_499;
    expect((await fetchAdminSession()).loggedIn).toBe(false);
    expect(calls).toBe(1);

    now += 2;
    expect((await fetchAdminSession()).loggedIn).toBe(true);
    expect(calls).toBe(2);
  });

  test("force refresh and explicit invalidation bypass the cache", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ loggedIn: true, adminCredentialsMissing: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await fetchAdminSession();
    await fetchAdminSession(true);
    invalidateAdminSessionCache();
    await fetchAdminSession();

    expect(calls).toBe(3);
  });

  test("recognizes only the admin route namespace", () => {
    for (const path of ["/admin", "/admin/", "/admin/login", "/admin/settings"]) {
      expect(isAdminAppRoute(path)).toBe(true);
    }
    for (const path of ["/", "/status", "/administrator", "/administer", "/api/admin/session"]) {
      expect(isAdminAppRoute(path)).toBe(false);
    }
  });
});
