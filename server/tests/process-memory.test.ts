import { afterEach, describe, expect, it, vi } from "vitest";
import { readProcessMemorySnapshot } from "../utils/process-memory";

function fakeUsage(rss: number): NodeJS.MemoryUsage {
  return {
    rss,
    heapTotal: rss,
    heapUsed: Math.floor(rss / 2),
    external: 0,
    arrayBuffers: 0,
  };
}

describe("readProcessMemorySnapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the live memory usage of the current process", () => {
    const snapshot = readProcessMemorySnapshot();

    expect(snapshot.rssBytes).toBeGreaterThan(0);
    expect(snapshot.heapTotalBytes).toBeGreaterThanOrEqual(snapshot.heapUsedBytes);
    expect(snapshot.peakRssBytes).toBeGreaterThanOrEqual(snapshot.rssBytes);
    expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snapshot.systemTotalBytes).toBeGreaterThan(0);
    expect(snapshot.systemFreeBytes).toBeGreaterThan(0);
    expect(snapshot.systemFreeBytes).toBeLessThanOrEqual(snapshot.systemTotalBytes);
    if (snapshot.limitBytes !== null) {
      expect(snapshot.limitBytes).toBeGreaterThan(0);
    }
  });

  it("uses the kernel high-water mark for the peak RSS", () => {
    vi.spyOn(process, "memoryUsage").mockReturnValue(fakeUsage(1024 * 1024));
    vi.spyOn(process, "resourceUsage").mockReturnValue({
      maxRSS: 2048,
    } as unknown as NodeJS.ResourceUsage);

    const snapshot = readProcessMemorySnapshot();

    expect(snapshot.peakRssBytes).toBe(2048 * 1024);
  });

  it("falls back to the current RSS when maxRSS is not usable", () => {
    vi.spyOn(process, "memoryUsage").mockReturnValue(fakeUsage(3 * 1024 * 1024));
    vi.spyOn(process, "resourceUsage").mockReturnValue({
      maxRSS: 0,
    } as unknown as NodeJS.ResourceUsage);

    expect(readProcessMemorySnapshot().peakRssBytes).toBe(3 * 1024 * 1024);
  });

  it("falls back to the current RSS when resourceUsage is unavailable", () => {
    vi.spyOn(process, "memoryUsage").mockReturnValue(fakeUsage(3 * 1024 * 1024));
    vi.spyOn(process, "resourceUsage").mockImplementation(() => {
      throw new Error("unsupported");
    });

    expect(readProcessMemorySnapshot().peakRssBytes).toBe(3 * 1024 * 1024);
  });

  it("treats an unreadable memory cap as null", () => {
    vi.spyOn(process, "constrainedMemory").mockReturnValue(0);

    expect(readProcessMemorySnapshot().limitBytes).toBeNull();
  });

  it("treats a throwing memory cap probe as null", () => {
    vi.spyOn(process, "constrainedMemory").mockImplementation(() => {
      throw new Error("unsupported");
    });

    expect(readProcessMemorySnapshot().limitBytes).toBeNull();
  });
});
