import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryMonitoringRepository } from "../storage/memory/monitoring-repository";
import type { AccessEventInput } from "../storage/repositories";

const NOW = new Date("2026-10-25T01:30:00.000Z").getTime();

function accessEvent(overrides: Partial<AccessEventInput> = {}): AccessEventInput {
  return {
    created_at: new Date(NOW).toISOString(),
    method: "GET",
    path: "/proxy.pac",
    category: "pac",
    source_ip: "203.0.113.7",
    user_agent: "vitest",
    status_code: 200,
    duration_ms: 10,
    response_bytes: 128,
    query_string: "",
    host: "localhost",
    referer: "",
    accept: "*/*",
    accept_language: "en",
    content_type: "",
    request_headers: "{}",
    response_content_type: "application/x-ns-proxy-autoconfig",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("memory monitoring repository", () => {
  it("records events and lists them newest first", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ path: "/one" }));
    repository.record(accessEvent({ path: "/two" }));
    repository.record(accessEvent({ path: "/three" }));

    expect(repository.count()).toBe(3);
    expect(repository.list().map((item) => item.path)).toEqual(["/three", "/two", "/one"]);
    expect(repository.list(2).map((item) => item.path)).toEqual(["/three", "/two"]);
  });

  it("paginates with a beforeId cursor", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    for (let index = 1; index <= 5; index += 1)
      repository.record(accessEvent({ path: `/${index}` }));

    const firstPage = repository.list(2);
    expect(firstPage.map((item) => item.id)).toEqual([5, 4]);
    const secondPage = repository.list(2, firstPage[firstPage.length - 1]!.id);
    expect(secondPage.map((item) => item.id)).toEqual([3, 2]);
  });

  it("clamps the page size into 1..201", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    for (let index = 0; index < 210; index += 1) repository.record(accessEvent());

    // 0 is falsy, so it falls back to the default page size.
    expect(repository.list(0)).toHaveLength(50);
    expect(repository.list(1000)).toHaveLength(201);
    // A negative page size is a real number, so it clamps to the lower bound of 1.
    expect(repository.list(-1)).toHaveLength(1);
  });

  it("returns clones so callers cannot mutate the store", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ path: "/original" }));
    const [first] = repository.list();
    first!.path = "/mutated";
    expect(repository.list()[0]!.path).toBe("/original");
  });

  it("drops records older than the retention window on every write", () => {
    const repository = createMemoryMonitoringRepository(() => 7);
    // The write-time sweep runs immediately, so an already-expired record never survives.
    repository.record(accessEvent({ created_at: new Date(NOW - 8 * 86400000).toISOString() }));
    expect(repository.count()).toBe(0);

    repository.record(accessEvent({ created_at: new Date(NOW - 6 * 86400000).toISOString() }));
    expect(repository.count()).toBe(1);

    repository.record(accessEvent());
    // Six days is still inside the seven-day retention window.
    expect(repository.count()).toBe(2);
    expect(repository.list()[0]!.created_at).toBe(new Date(NOW).toISOString());
  });

  it("caps the store at 5000 records", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    for (let index = 0; index < 5005; index += 1) repository.record(accessEvent());
    expect(repository.count()).toBe(5000);
  });

  it("estimates the stored byte size", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(
      accessEvent({ path: "/abc", category: "pac", source_ip: "1.2.3.4", user_agent: "agent" })
    );
    // path(4) + category(3) + ip(7) + ua(5) + 96
    expect(repository.storageBytes()).toBe(4 + 3 + 7 + 5 + 96);
  });

  it("cleans up records past the retention window", () => {
    // Records written under a wider retention survive the write-time sweep;
    // lowering the retention and running cleanup() prunes them.
    let retentionDays = 30;
    const repository = createMemoryMonitoringRepository(() => retentionDays);
    repository.record(accessEvent({ created_at: new Date(NOW - 5 * 86400000).toISOString() }));
    repository.record(accessEvent({ created_at: new Date(NOW - 3 * 86400000).toISOString() }));
    repository.record(accessEvent({ created_at: new Date(NOW).toISOString() }));

    retentionDays = 2;
    expect(repository.cleanup()).toBe(2);
    expect(repository.count()).toBe(1);
    expect(repository.list()[0]!.created_at).toBe(new Date(NOW).toISOString());
  });

  it("accepts an explicit retention window that overrides the configured one", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ created_at: new Date(NOW - 5 * 86400000).toISOString() }));
    expect(repository.cleanup(30)).toBe(0);
    expect(repository.cleanup(3)).toBe(1);
  });

  it("skips cleanup for a non-positive retention window", () => {
    const repository = createMemoryMonitoringRepository(() => 0);
    repository.record(accessEvent());
    expect(repository.cleanup()).toBe(0);
    expect(repository.cleanup(-5)).toBe(0);
    expect(repository.count()).toBe(1);
  });

  it("clears the store and reports how many records were removed", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent());
    repository.record(accessEvent());
    expect(repository.clear()).toBe(2);
    expect(repository.count()).toBe(0);
    expect(repository.clear()).toBe(0);
  });
});

describe("memory monitoring summary", () => {
  it("returns an empty-but-valid summary for a fresh repository", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    const summary = repository.summarize(0, 0);

    expect(summary).toMatchObject({
      activeRequests: 0,
      tcpConnections: 0,
      requestsLastHour: 0,
      requestsLast24h: 0,
      uniqueSourcesLast24h: 0,
      errorRequestsLast24h: 0,
      serverErrorsLast24h: 0,
      averageResponseMs: 0,
      p95ResponseMs: 0,
      errorRate: 0,
      pacRequestsLastHour: 0,
      pacRequestsLast24h: 0,
      pacSuccessRate: 100,
      pacFailureRequestsLast24h: 0,
      pacAverageResponseMs: 0,
      latestPacRequest: null,
    });
    expect(summary.requestTrend).toHaveLength(24);
    expect(summary.pacRequestTrend).toHaveLength(24);
    expect(summary.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("counts requests, errors and unique sources over the last day", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ source_ip: "203.0.113.1", status_code: 200 }));
    repository.record(accessEvent({ source_ip: "203.0.113.2", status_code: 404 }));
    repository.record(accessEvent({ source_ip: "203.0.113.2", status_code: 503 }));
    repository.record(accessEvent({ source_ip: "unknown", status_code: 200 }));

    const summary = repository.summarize(0, 0);
    expect(summary.requestsLast24h).toBe(4);
    expect(summary.errorRequestsLast24h).toBe(2);
    expect(summary.serverErrorsLast24h).toBe(1);
    // "unknown" is not a real client address, so it is excluded.
    expect(summary.uniqueSourcesLast24h).toBe(2);
    expect(summary.errorRate).toBe(50);
  });

  it("separates the last hour from the last day", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ created_at: new Date(NOW - 2 * 3600000).toISOString() }));
    repository.record(accessEvent({ created_at: new Date(NOW - 10 * 60000).toISOString() }));

    const summary = repository.summarize(0, 0);
    expect(summary.requestsLastHour).toBe(1);
    expect(summary.requestsLast24h).toBe(2);
  });

  it("ignores records older than a day", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ created_at: new Date(NOW - 3 * 86400000).toISOString() }));
    expect(repository.summarize(0, 0).requestsLast24h).toBe(0);
  });

  it("computes the average and p95 response time", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    for (const duration of [10, 20, 30, 40, 50]) {
      repository.record(accessEvent({ duration_ms: duration }));
    }
    const summary = repository.summarize(0, 0);
    expect(summary.averageResponseMs).toBe(30);
    expect(summary.p95ResponseMs).toBe(50);
  });

  it("rounds averages to one decimal place", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ duration_ms: 10 }));
    repository.record(accessEvent({ duration_ms: 11 }));
    repository.record(accessEvent({ duration_ms: 11 }));
    expect(repository.summarize(0, 0).averageResponseMs).toBe(10.7);
  });

  it("summarizes PAC requests and the success rate", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ status_code: 200, duration_ms: 5 }));
    repository.record(accessEvent({ status_code: 304, duration_ms: 7 }));
    repository.record(accessEvent({ status_code: 500, duration_ms: 9 }));
    repository.record(accessEvent({ status_code: 100, duration_ms: 11 }));
    repository.record(
      accessEvent({ category: "page", path: "/", status_code: 200, duration_ms: 100 })
    );

    const summary = repository.summarize(0, 0);
    expect(summary.pacRequestsLast24h).toBe(4);
    expect(summary.pacRequestsLastHour).toBe(4);
    // 200 and 304 count as successes; 500 and 100 do not.
    expect(summary.pacSuccessRate).toBe(50);
    expect(summary.pacFailureRequestsLast24h).toBe(2);
    expect(summary.pacAverageResponseMs).toBe(8);
  });

  it("exposes the latest PAC request with only the summary fields", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ path: "/old.pac", status_code: 200 }));
    repository.record(accessEvent({ path: "/new.pac", status_code: 404, duration_ms: 3 }));

    const summary = repository.summarize(0, 0);
    expect(summary.latestPacRequest).toEqual({
      created_at: new Date(NOW).toISOString(),
      source_ip: "203.0.113.7",
      status_code: 404,
      duration_ms: 3,
    });
  });

  it("builds a 24-slot hourly trend ending at the current hour", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ duration_ms: 10 }));
    repository.record(accessEvent({ duration_ms: 20 }));
    repository.record(accessEvent({ status_code: 500, duration_ms: 30 }));

    const trend = repository.summarize(0, 0).requestTrend;
    expect(trend).toHaveLength(24);
    const currentSlot = trend[trend.length - 1]!;
    expect(currentSlot.requests).toBe(3);
    expect(currentSlot.errors).toBe(1);
    expect(currentSlot.hour).toBe(new Date(Math.floor(NOW / 3600000) * 3600000).toISOString());
    // Empty slots stay zeroed.
    expect(trend[0]).toMatchObject({ requests: 0, errors: 0 });
  });

  it("tracks the PAC trend separately from all traffic", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ category: "pac", status_code: 200 }));
    repository.record(accessEvent({ category: "page", path: "/", status_code: 200 }));

    const summary = repository.summarize(0, 0);
    expect(summary.requestTrend[23]!.requests).toBe(2);
    expect(summary.pacRequestTrend[23]!.requests).toBe(1);
    // A PAC status below 200 counts as a PAC failure even though it is not an HTTP error.
    expect(summary.pacRequestTrend[23]!.errors).toBe(0);
  });

  it("counts a sub-200 PAC status as a trend error", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    repository.record(accessEvent({ category: "pac", status_code: 100 }));

    const summary = repository.summarize(0, 0);
    expect(summary.pacRequestTrend[23]!.errors).toBe(1);
    // The generic trend only counts >= 400.
    expect(summary.requestTrend[23]!.errors).toBe(0);
  });

  it("never reports negative live counters", () => {
    const repository = createMemoryMonitoringRepository(() => 30);
    const summary = repository.summarize(-3, -9);
    expect(summary.activeRequests).toBe(0);
    expect(summary.tcpConnections).toBe(0);
  });
});
