import type {
  AccessEvent,
  AccessEventInput,
  MonitorSummary,
  SyncMonitoringRepository,
} from "../repositories";
import { clone, safeLimit } from "./utils";

export function createMemoryMonitoringRepository(
  getRetentionDays: () => number
): SyncMonitoringRepository {
  const events = new Map<number, AccessEvent>();
  // record() sweeps expired events on every write. Cache the parsed timestamp so
  // a full sweep does not re-parse every ISO string (5005 writes would otherwise
  // call Date.parse ~12.5M times and can exceed Vitest's 5s default timeout on CI).
  const eventTimestamps = new Map<number, number>();
  let nextEventId = 1;
  const monitoring = {
    record(event: AccessEventInput) {
      const id = nextEventId++;
      const timestamp = Date.parse(event.created_at);
      events.set(id, { ...clone(event), id });
      eventTimestamps.set(id, timestamp);
      const retentionDays = getRetentionDays();
      if (retentionDays > 0) {
        const cutoff = Date.now() - retentionDays * 86400000;
        for (const [eventId, recordedAt] of eventTimestamps)
          if (recordedAt < cutoff) {
            events.delete(eventId);
            eventTimestamps.delete(eventId);
          }
      }
      while (events.size > 5000) {
        const oldestId = events.keys().next().value!;
        events.delete(oldestId);
        eventTimestamps.delete(oldestId);
      }
    },
    list(limit = 50, beforeId = 0) {
      const all = [...events.values()].sort((a, b) => b.id - a.id);
      return (beforeId > 0 ? all.filter((x) => x.id < beforeId) : all)
        .slice(0, safeLimit(limit, 50, 201))
        .map(clone);
    },
    count: () => events.size,
    storageBytes: () =>
      [...events.values()].reduce(
        (sum, e) =>
          sum + e.path.length + e.category.length + e.source_ip.length + e.user_agent.length + 96,
        0
      ),
    cleanup(retentionDays = getRetentionDays()) {
      if (retentionDays <= 0) return 0;
      const cutoff = Date.now() - retentionDays * 86400000;
      let deleted = 0;
      for (const [id, recordedAt] of eventTimestamps)
        if (recordedAt < cutoff) {
          events.delete(id);
          eventTimestamps.delete(id);
          deleted++;
        }
      return deleted;
    },
    clear() {
      const count = events.size;
      events.clear();
      eventTimestamps.clear();
      return count;
    },
    summarize(activeRequests: number, tcpConnections: number): MonitorSummary {
      const now = Date.now();
      const hourAgo = now - 3600000;
      const dayAgo = now - 86400000;
      const all = [...events.values()];
      const day = all.filter((e) => Date.parse(e.created_at) >= dayAgo);
      const hour = all.filter((e) => Date.parse(e.created_at) >= hourAgo);
      const pacDay = day.filter((e) => e.category === "pac");
      const pacHour = hour.filter((e) => e.category === "pac");
      const errors = day.filter((e) => e.status_code >= 400);
      const serverErrors = day.filter((e) => e.status_code >= 500);
      const durations = day.map((e) => e.duration_ms).sort((a, b) => a - b);
      const p95 = durations.length
        ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)]
        : 0;
      const uniqueSources = new Set(day.map((e) => e.source_ip).filter((ip) => ip !== "unknown"))
        .size;
      const hourly = (items: AccessEvent[], category?: string) => {
        const selected = category ? items.filter((e) => e.category === category) : items;
        const byHour = new Map<string, AccessEvent[]>();
        for (const event of selected) {
          const key = new Date(event.created_at).toISOString().slice(0, 13);
          const list = byHour.get(key) ?? [];
          list.push(event);
          byHour.set(key, list);
        }
        const currentHour = Math.floor(now / 3600000) * 3600000;
        return Array.from({ length: 24 }, (_, index) => {
          const slot = new Date(currentHour - (23 - index) * 3600000);
          const values = byHour.get(slot.toISOString().slice(0, 13)) ?? [];
          const failed = values.filter(
            (e) => e.status_code >= 400 || (category === "pac" && e.status_code < 200)
          );
          return {
            hour: slot.toISOString(),
            requests: values.length,
            errors: failed.length,
            averageResponseMs: values.length
              ? Math.round(
                  (values.reduce((sum, e) => sum + e.duration_ms, 0) / values.length) * 10
                ) / 10
              : 0,
          };
        });
      };
      const latestPac = [...all].filter((e) => e.category === "pac").sort((a, b) => b.id - a.id)[0];
      const average = (items: AccessEvent[]) =>
        items.length ? items.reduce((sum, e) => sum + e.duration_ms, 0) / items.length : 0;
      const pacSuccess = pacDay.filter((e) => e.status_code >= 200 && e.status_code < 400).length;
      return {
        generatedAt: new Date(now).toISOString(),
        activeRequests: Math.max(0, activeRequests),
        tcpConnections: Math.max(0, tcpConnections),
        requestsLastHour: hour.length,
        requestsLast24h: day.length,
        uniqueSourcesLast24h: uniqueSources,
        errorRequestsLast24h: errors.length,
        serverErrorsLast24h: serverErrors.length,
        averageResponseMs: Math.round(average(day) * 10) / 10,
        p95ResponseMs: Math.round(p95 * 10) / 10,
        errorRate: day.length ? Math.round((errors.length / day.length) * 1000) / 10 : 0,
        requestTrend: hourly(day),
        pacRequestsLastHour: pacHour.length,
        pacRequestsLast24h: pacDay.length,
        pacSuccessRate: pacDay.length ? Math.round((pacSuccess / pacDay.length) * 1000) / 10 : 100,
        pacFailureRequestsLast24h: pacDay.filter((e) => e.status_code >= 400 || e.status_code < 200)
          .length,
        pacAverageResponseMs: Math.round(average(pacDay) * 10) / 10,
        latestPacRequest: latestPac
          ? {
              created_at: latestPac.created_at,
              source_ip: latestPac.source_ip,
              status_code: latestPac.status_code,
              duration_ms: latestPac.duration_ms,
            }
          : null,
        pacRequestTrend: hourly(day, "pac"),
      };
    },
  };
  return monitoring;
}
