import os from "node:os";

/**
 * Process-level memory snapshot for the admin system panel. The peak comes
 * from the kernel high-water mark (`maxRSS`, reported in kilobytes) so a
 * short-lived spike — e.g. the startup PAC compression — stays visible even
 * when nobody is polling. Runtimes without `resourceUsage()` fall back to
 * the current RSS, which then doubles as the reported peak.
 */
export interface ProcessMemorySnapshot {
  rssBytes: number;
  peakRssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  uptimeSeconds: number;
  systemTotalBytes: number;
  systemFreeBytes: number;
  /** Runtime-imposed memory cap in bytes, or null when it cannot be read. */
  limitBytes: number | null;
}

function kernelPeakRssBytes(): number | null {
  try {
    const maxRssKb = process.resourceUsage().maxRSS;
    if (Number.isFinite(maxRssKb) && maxRssKb > 0) return maxRssKb * 1024;
  } catch {
    // resourceUsage() is not available on every runtime.
  }
  return null;
}

function readLimitBytes(): number | null {
  try {
    const limit = process.constrainedMemory();
    if (Number.isFinite(limit) && limit > 0) return limit;
  } catch {
    // Runtimes without cgroup introspection may throw or report zero.
  }
  return null;
}

export function readProcessMemorySnapshot(): ProcessMemorySnapshot {
  const usage = process.memoryUsage();
  const kernelPeak = kernelPeakRssBytes();
  return {
    rssBytes: usage.rss,
    peakRssBytes: kernelPeak ?? usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
    uptimeSeconds: Math.round(process.uptime()),
    systemTotalBytes: os.totalmem(),
    systemFreeBytes: os.freemem(),
    limitBytes: readLimitBytes(),
  };
}
