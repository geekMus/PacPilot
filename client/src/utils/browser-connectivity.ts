export interface BrowserConnectivityResult {
  testedAt: string;
  success: boolean;
  elapsedMs: number;
  errorDetail: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Tests reachability from the visiting browser, using the browser's own network
 * and proxy configuration. no-cors deliberately avoids requiring CORS headers;
 * consequently, the response status/body are not observable.
 */
export async function testBrowserConnectivity(
  targetUrl: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BrowserConnectivityResult> {
  const url = new URL(targetUrl);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
    throw new TypeError("Expected a valid HTTPS URL without credentials or a fragment.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Timeout must be a positive finite number.");
  }

  const testedAt = new Date().toISOString();
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetcher(url.toString(), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      testedAt,
      success: true,
      elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
      errorDetail: "",
    };
  } catch (error) {
    const message =
      controller.signal.aborted
        ? `Request timed out after ${timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      testedAt,
      success: false,
      elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
      errorDetail: message.replace(/[\r\n\t]/g, " ").slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}
