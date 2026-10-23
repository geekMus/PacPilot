import type { Database } from "bun:sqlite";
import type { AccessEventInput, SyncMonitoringRepository } from "../repositories";
import { getSettings } from "./settings";
import {
  countAccessEvents,
  getMonitorSummary,
  listAccessEvents,
  recordAccessEvent,
} from "./monitoring";

export function createSqliteMonitoringRepository(database: Database): SyncMonitoringRepository {
  return {
    record: (event: AccessEventInput) => recordAccessEvent(database, event),
    list: (limit = 50, beforeId = 0) => listAccessEvents(database, limit, beforeId),
    count: () => countAccessEvents(database),
    storageBytes: () => {
      const row = database
        .query(
          "SELECT COALESCE(SUM(length(path) + length(category) + length(source_ip) + length(user_agent) + 96), 0) AS bytes FROM access_events"
        )
        .get() as { bytes: number };
      return Number(row.bytes || 0);
    },
    summarize: (activeRequests, tcpConnections) =>
      getMonitorSummary(database, activeRequests, tcpConnections),
    cleanup: (retentionDays = getSettings(database).logRetentionDays) => {
      if (retentionDays <= 0) return 0;
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
      return Number(
        database.query("DELETE FROM access_events WHERE created_at < ?").run(cutoff).changes
      );
    },
    clear: () => {
      const count = countAccessEvents(database);
      database.query("DELETE FROM access_events").run();
      return count;
    },
  };
}
