import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { AccessEventInput, MonitoringRepository } from "../storage/repositories";
import {
  getActiveRequestCount,
  getTcpConnectionCount,
  requestMonitoringMiddleware,
  trackTcpConnection,
} from "../services/request-monitor";
import { configureClientIp } from "../utils/client-ip";

interface FakeRequestOptions {
  path?: string;
  method?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[]>;
  remoteAddress?: string;
}

function fakeRequest(options: FakeRequestOptions = {}): Request {
  const headers = options.headers ?? {};
  return {
    path: options.path ?? "/pac",
    method: options.method ?? "GET",
    originalUrl: options.originalUrl ?? options.path ?? "/pac",
    url: options.originalUrl ?? options.path ?? "/pac",
    headers,
    socket: { remoteAddress: options.remoteAddress ?? "203.0.113.7" },
  } as unknown as Request;
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  writableFinished = false;
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  finish(statusCode = 200): void {
    this.statusCode = statusCode;
    this.writableFinished = true;
    this.emit("finish");
  }

  abort(): void {
    this.writableFinished = false;
    this.emit("close");
  }
}

function fakeRepository(): MonitoringRepository & { record: ReturnType<typeof vi.fn> } {
  return {
    record: vi.fn(),
    list: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    storageBytes: vi.fn(async () => 0),
    cleanup: vi.fn(async () => 0),
    clear: vi.fn(async () => 0),
    summarize: vi.fn(),
  } as unknown as MonitoringRepository & { record: ReturnType<typeof vi.fn> };
}

function run(
  middleware: ReturnType<typeof requestMonitoringMiddleware>,
  request: Request,
  response: FakeResponse
): NextFunction {
  const next = vi.fn();
  middleware(request, response as unknown as Response, next as unknown as NextFunction);
  return next as unknown as NextFunction;
}

function lastRecord(repository: { record: ReturnType<typeof vi.fn> }): AccessEventInput {
  const calls = repository.record.mock.calls;
  return calls[calls.length - 1]![0] as AccessEventInput;
}

beforeEach(() => {
  configureClientIp({ trustProxyHops: 0, trustCloudflare: false, trustedProxyCidrs: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestMonitoringMiddleware", () => {
  it("records a completed request", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const request = fakeRequest({
      path: "/pac",
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0",
        host: "pac.example.com",
        referer: "https://ref.example.com/page",
        accept: "text/plain",
        "accept-language": "zh-CN",
        "content-type": "application/json",
      },
    });
    const response = new FakeResponse();
    response.setHeader("content-length", "1234");
    response.setHeader("content-type", "text/plain; charset=utf-8");

    const next = run(middleware, request, response);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getActiveRequestCount()).toBe(1);

    response.finish(200);

    expect(getActiveRequestCount()).toBe(0);
    const record = lastRecord(repository);
    expect(record).toMatchObject({
      method: "GET",
      path: "/pac",
      category: "pac",
      source_ip: "203.0.113.7",
      user_agent: "Mozilla/5.0",
      status_code: 200,
      response_bytes: 1234,
      host: "pac.example.com",
      referer: "https://ref.example.com/page",
      accept: "text/plain",
      accept_language: "zh-CN",
      content_type: "application/json",
      response_content_type: "text/plain; charset=utf-8",
    });
    expect(record.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof record.duration_ms).toBe("number");
    expect(JSON.parse(record.request_headers)).toMatchObject({ "user-agent": "Mozilla/5.0" });
  });

  it("only records once when finish and close both fire", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(middleware, fakeRequest(), response);
    response.finish(200);
    response.abort();

    expect(repository.record).toHaveBeenCalledTimes(1);
  });

  it("records 499 for aborted requests", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(middleware, fakeRequest(), response);
    response.abort();

    expect(lastRecord(repository).status_code).toBe(499);
  });

  it("keeps the real status when the response already finished", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(middleware, fakeRequest(), response);
    response.statusCode = 204;
    response.writableFinished = true;
    response.emit("close");

    expect(lastRecord(repository).status_code).toBe(204);
  });

  it("categorizes pac, admin API, public API and pages", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const cases: Array<[string, string]> = [
      ["/pac", "pac"],
      ["/api/admin/settings", "admin-api"],
      ["/api/meta", "public-api"],
      ["/admin/dashboard", "page"],
    ];

    for (const [path, category] of cases) {
      const response = new FakeResponse();
      run(middleware, fakeRequest({ path }), response);
      response.finish(200);
      expect(lastRecord(repository).category).toBe(category);
    }
  });

  it("skips excluded paths without touching the counter", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const skipped = [
      "/api/admin/monitor/summary",
      "/api/admin/storage",
      "/api/admin/logs/cleanup",
      "/api/admin/logs/clear",
      "/assets/index-abc.js",
      "/favicon.ico",
      "/app.js",
      "/styles.css",
      "/logo.svg",
      "/font.woff2",
    ];

    for (const path of skipped) {
      const next = vi.fn();
      middleware(fakeRequest({ path }), new FakeResponse() as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(repository.record).not.toHaveBeenCalled();
    expect(getActiveRequestCount()).toBe(0);
  });

  it("does not exclude unrelated admin API paths", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();
    run(middleware, fakeRequest({ path: "/api/admin/monitor" }), response);
    response.finish(200);
    expect(repository.record).toHaveBeenCalledTimes(1);
  });

  it("extracts the raw query string and caps it", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();
    const longValue = "x".repeat(600);

    run(
      middleware,
      fakeRequest({ path: "/api/meta", originalUrl: `/api/meta?token=${longValue}` }),
      response
    );
    response.finish(200);

    const record = lastRecord(repository);
    expect(record.query_string.startsWith("token=xxx")).toBe(true);
    expect(record.query_string.length).toBe(512);
  });

  it("stores an empty query string when there is no query", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(middleware, fakeRequest({ path: "/api/meta", originalUrl: "/api/meta" }), response);
    response.finish(200);

    expect(lastRecord(repository).query_string).toBe("");
  });

  it("sanitizes header values and joins repeated headers", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(
      middleware,
      fakeRequest({
        path: "/api/meta",
        headers: { "accept-language": ["zh-CN", "en-US"], "user-agent": "a\r\nb\tc" },
      }),
      response
    );
    response.finish(200);

    const record = lastRecord(repository);
    expect(record.accept_language).toBe("zh-CN, en-US");
    expect(record.user_agent).toBe("a  b c");
    expect(JSON.parse(record.request_headers)["accept-language"]).toBe("zh-CN, en-US");
  });

  it("caps oversized header values", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(
      middleware,
      fakeRequest({
        path: "/api/meta",
        headers: { referer: "r".repeat(2000), accept: "a".repeat(400) },
      }),
      response
    );
    response.finish(200);

    const record = lastRecord(repository);
    expect(record.referer.length).toBe(1024);
    expect(record.accept.length).toBe(256);
  });

  it("caps the collected headers JSON", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();
    const headers: Record<string, string> = {};
    for (let index = 0; index < 20; index += 1) {
      headers[`x-header-${index}`] = "v".repeat(2048);
    }

    run(middleware, fakeRequest({ path: "/api/meta", headers }), response);
    response.finish(200);

    expect(lastRecord(repository).request_headers.length).toBe(16000);
  });

  it("logs and swallows repository failures", () => {
    const repository = fakeRepository();
    repository.record.mockImplementation(() => {
      throw new Error("database is locked");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(middleware, fakeRequest(), response);
    expect(() => response.finish(200)).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]!.join(" "))).toContain("Failed to write access record");
    expect(String(warn.mock.calls[0]!.join(" "))).toContain("database is locked");
    expect(getActiveRequestCount()).toBe(0);
  });

  it("defaults the path to / when Express reports an empty one", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();

    run(middleware, fakeRequest({ path: "" }), response);
    response.finish(200);

    expect(lastRecord(repository).path).toBe("/");
  });

  it("ignores zero or negative content lengths", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const response = new FakeResponse();
    response.setHeader("content-length", "-5");

    run(middleware, fakeRequest(), response);
    response.finish(200);

    expect(lastRecord(repository).response_bytes).toBe(0);
  });

  it("tracks concurrent in-flight requests", () => {
    const repository = fakeRepository();
    const middleware = requestMonitoringMiddleware(repository);
    const first = new FakeResponse();
    const second = new FakeResponse();

    run(middleware, fakeRequest({ path: "/pac" }), first);
    run(middleware, fakeRequest({ path: "/api/meta" }), second);
    expect(getActiveRequestCount()).toBe(2);

    first.finish(200);
    expect(getActiveRequestCount()).toBe(1);

    second.finish(200);
    expect(getActiveRequestCount()).toBe(0);
  });
});

describe("trackTcpConnection", () => {
  it("counts live sockets and drops them on close", () => {
    const socket = new EventEmitter() as unknown as {
      once: EventEmitter["once"];
      emit: EventEmitter["emit"];
    };
    const before = getTcpConnectionCount();

    trackTcpConnection(socket as never);
    expect(getTcpConnectionCount()).toBe(before + 1);

    (socket as unknown as EventEmitter).emit("close");
    expect(getTcpConnectionCount()).toBe(before);
  });
});
