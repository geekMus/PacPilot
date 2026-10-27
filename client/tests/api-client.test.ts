import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  resolveApiUrl: vi.fn((path: string) => path),
  isCrossOriginApi: vi.fn(() => false),
  // 真实实现会等运行配置解析完成；单测里直接视为已就绪。
  ensureRuntimeConfig: vi.fn(() => Promise.resolve()),
}));
const token = vi.hoisted(() => ({
  readSessionToken: vi.fn(() => ""),
  saveSessionToken: vi.fn(),
  clearSessionToken: vi.fn(),
}));
const auth = vi.hoisted(() => ({ emitUnauthorized: vi.fn() }));

vi.mock("@/api/runtime-config", () => runtime);
vi.mock("@/api/session-token", () => token);
vi.mock("@/api/auth-events", () => auth);

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadClient() {
  vi.resetModules();
  return await import("../src/api/client");
}

beforeEach(() => {
  fetchMock.mockReset();
  runtime.resolveApiUrl.mockImplementation((path: string) => path);
  runtime.isCrossOriginApi.mockReturnValue(false);
  runtime.ensureRuntimeConfig.mockImplementation(() => Promise.resolve());
  token.readSessionToken.mockReturnValue("");
  token.saveSessionToken.mockReset();
  token.clearSessionToken.mockReset();
  auth.emitUnauthorized.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request plumbing", () => {
  it("sends JSON headers without an Authorization header when unauthenticated", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ version: "1.0.0" }));
    const { api } = await loadClient();

    await api.meta();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/meta");
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe("include");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Accept-Language"]).toBe("zh-CN");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("attaches a bearer token and omits credentials for cross-origin deployments", async () => {
    token.readSessionToken.mockReturnValue("token-1");
    runtime.isCrossOriginApi.mockReturnValue(true);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { api } = await loadClient();

    await api.session();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer token-1");
    expect(init.credentials).toBe("omit");
  });

  it("keeps caller supplied headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { api } = await loadClient();

    await api.testNotificationChannel("c#1");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/notifications/channels/c%231/test");
  });

  it("routes requests through resolveApiUrl", async () => {
    runtime.resolveApiUrl.mockImplementation((path: string) => "https://api.example.com" + path);
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { api } = await loadClient();

    await api.status();

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/status");
  });
});

describe("error handling", () => {
  it("surfaces the server error payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom", errorCode: "bad_thing" }, 400));
    const { api, ApiError } = await loadClient();

    const failure = await api.meta().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).name).toBe("ApiError");
    expect((failure as Error).message).toBe("boom");
    expect((failure as { code: string }).code).toBe("bad_thing");
  });

  it("prefers the error field and falls back to message then statusText", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "from message" }, 500));
    fetchMock.mockResolvedValueOnce(
      new Response("plain text", { status: 503, statusText: "Nope" })
    );
    const { api } = await loadClient();

    await expect(api.meta()).rejects.toThrow("from message");
    await expect(api.meta()).rejects.toThrow("Nope");
  });

  it("translates a setup_required message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "setup_required" }, 400));
    const { api } = await loadClient();

    const failure = (await api.meta().catch((error: unknown) => error)) as Error;

    expect(failure.message).not.toBe("setup_required");
  });

  it("drops the local session on an unauthorized admin response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    const { api } = await loadClient();

    await expect(api.settings()).rejects.toThrow("unauthorized");

    expect(token.clearSessionToken).toHaveBeenCalledTimes(1);
    expect(auth.emitUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not fire the unauthorized hook for a failed login", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "bad password" }, 401));
    const { api } = await loadClient();

    await expect(api.login("wrong")).rejects.toThrow("bad password");

    expect(token.clearSessionToken).not.toHaveBeenCalled();
    expect(auth.emitUnauthorized).not.toHaveBeenCalled();
  });
});

describe("session helpers", () => {
  it("keeps the token out of storage for same-origin cookie deployments", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, token: "abc", expiresAt: 123 }));
    const { api } = await loadClient();

    const result = await api.login("secret");

    expect(result).toEqual({ ok: true, token: "abc", expiresAt: 123 });
    expect(token.saveSessionToken).not.toHaveBeenCalled();
  });

  it("stores the token when the backend reports bearer auth", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/admin/session") {
        return jsonResponse({
          loggedIn: false,
          adminCredentialsMissing: false,
          authMode: "bearer",
        });
      }
      return jsonResponse({ ok: true, token: "abc", expiresAt: 123 });
    });
    const { api } = await loadClient();

    await api.session();
    await api.login("secret");

    expect(token.saveSessionToken).toHaveBeenCalledWith("abc", 123);
  });

  it("clears the token after logout even when the request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "network" }, 500));
    const { api } = await loadClient();

    await expect(api.logout()).rejects.toThrow("network");

    expect(token.clearSessionToken).toHaveBeenCalledTimes(1);
  });
});

describe("endpoint shapes", () => {
  it("encodes notification ids into the path", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));
    const { api } = await loadClient();

    await api.updateNotificationChannel("a/b", { name: "x" });
    await api.deleteNotificationRule("r 1");
    await api.retryNotificationDelivery("d#2");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/notifications/channels/a%2Fb");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/notifications/rules/r%201");
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/admin/notifications/deliveries/d%232/retry");
  });

  it("builds paginated query strings", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}));
    const { api } = await loadClient();

    await api.workflows(20, 7);
    await api.monitorAccessPage(10, 3);
    await api.workflows();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/workflows?limit=20&beforeId=7");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/admin/monitor/access?paged=1&limit=10&beforeId=3"
    );
    expect(fetchMock.mock.calls[2][0]).toBe("/api/admin/workflows?limit=50&beforeId=0");
  });

  it("sends the reset confirmation payload", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));
    const { api } = await loadClient();

    await api.factoryReset();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/factory-reset");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ confirm: "RESET" });
  });

  it("exposes every endpoint without throwing", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}));
    const { api } = await loadClient();

    const args: Record<string, unknown[]> = {
      updateNotificationChannel: ["id", {}],
      deleteNotificationChannel: ["id"],
      testNotificationChannel: ["id"],
      updateNotificationRule: ["id", {}],
      deleteNotificationRule: ["id"],
      retryNotificationDelivery: ["id"],
    };
    const methods = Object.entries(api) as Array<
      [string, (...params: never[]) => Promise<unknown>]
    >;

    for (const [name, method] of methods) {
      await method(...((args[name] ?? []) as never[]));
    }

    expect(fetchMock).toHaveBeenCalledTimes(methods.length);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers["Content-Type"]).toBe("application/json");
    }
  });
});
