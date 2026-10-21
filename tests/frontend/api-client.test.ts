import { afterEach, describe, expect, test } from "bun:test";
import { ApiError, api } from "../../client/src/api/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("frontend API client request contract", () => {
  test("sends JSON credentials and serializes login payload", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await expect(api.login("secret")).resolves.toEqual({ ok: true });
    expect(requestUrl).toBe("/api/admin/login");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
    expect(new Headers(requestInit?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ password: "secret" });
  });

  test("converts JSON error responses into ApiError without losing machine-readable fields", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "invalid_settings", errorCode: "SETTINGS_INVALID", errorDetail: "mode" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    try {
      await api.saveSettings({} as never);
      throw new Error("Expected saveSettings to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        message: "invalid_settings",
        code: "SETTINGS_INVALID",
        detail: "mode",
      });
    }
  });

  test("falls back to HTTP status text for non-JSON error responses", async () => {
    globalThis.fetch = (async () =>
      new Response("upstream failure", { status: 502, statusText: "Bad Gateway" })) as typeof fetch;

    await expect(api.status()).rejects.toMatchObject({
      name: "ApiError",
      message: "Bad Gateway",
      code: "",
      detail: "",
    });
  });

  test("maps an old-backend save-and-generate 404 to the version-mismatch message", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await expect(api.saveAndGenerate({} as never)).rejects.toMatchObject({
      name: "ApiError",
      message: "serverErrors.versionMismatch",
    });
  });

  test("encodes pagination arguments into list API URLs", async () => {
    let requestUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ items: [], nextCursor: null, total: 0, hasMore: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await api.logsPage(25, 900);
    expect(requestUrl).toBe("/api/admin/logs/page?limit=25&beforeId=900");
  });
});
