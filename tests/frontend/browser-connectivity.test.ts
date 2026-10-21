import { afterEach, describe, expect, test } from "bun:test";
import { testBrowserConnectivity } from "../../client/src/utils/browser-connectivity";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("browser connectivity probe", () => {
  test("uses the browser network stack without requiring CORS access or credentials", async () => {
    let requestedUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const result = await testBrowserConnectivity("https://example.com/ping?x=1", fetcher);

    expect(requestedUrl).toBe("https://example.com/ping?x=1");
    expect(requestInit).toMatchObject({
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
    expect(result.success).toBe(true);
    expect(result.errorDetail).toBe("");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test("treats an opaque-fetch-compatible response as reachable without inspecting status", async () => {
    const fetcher = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    const result = await testBrowserConnectivity("https://example.com/", fetcher);
    expect(result.success).toBe(true);
  });

  test("returns a bounded network error instead of throwing on fetch failure", async () => {
    const fetcher = (async () => {
      throw new TypeError("Failed to fetch\nconnection reset");
    }) as typeof fetch;

    const result = await testBrowserConnectivity("https://example.com/", fetcher);
    expect(result.success).toBe(false);
    expect(result.errorDetail).toBe("Failed to fetch connection reset");
  });

  test("aborts a stalled browser request at the configured timeout", async () => {
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as typeof fetch;

    const result = await testBrowserConnectivity("https://example.com/", fetcher, 5);
    expect(result.success).toBe(false);
    expect(result.errorDetail).toBe("Request timed out after 5 ms.");
  });

  test("rejects non-HTTPS, credentials, and fragments before issuing a request", async () => {
    const fetcher = (async () => {
      throw new Error("fetch must not run for an invalid URL");
    }) as typeof fetch;

    await expect(testBrowserConnectivity("http://example.com/", fetcher)).rejects.toThrow(
      "valid HTTPS URL"
    );
    await expect(testBrowserConnectivity("https://user:pass@example.com/", fetcher)).rejects.toThrow(
      "valid HTTPS URL"
    );
    await expect(testBrowserConnectivity("https://example.com/#fragment", fetcher)).rejects.toThrow(
      "valid HTTPS URL"
    );
  });
});
