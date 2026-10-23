import type { Database } from "bun:sqlite";
import type { SyncGenerationLogRepository } from "../repositories";
import { appendGenerationLog, countGenerationLogs, recentLogs } from "./generation-logs";
import { getSettings } from "./settings";

export function createSqliteGenerationLogRepository(
  database: Database
): SyncGenerationLogRepository {
  return {
    append: (success, mode, resultCode, detail = {}, error = "") =>
      appendGenerationLog(database, success, mode, resultCode, detail, error),
    list: (limit = 20, offset = 0, beforeId = 0) => recentLogs(database, limit, offset, beforeId),
    count: () => countGenerationLogs(database),
    storageBytes: () => {
      const row = database
        .query(
          "SELECT COALESCE(SUM(length(result_code) + length(detail) + length(error) + length(mode) + 48), 0) AS bytes FROM generation_log"
        )
        .get() as { bytes: number };
      return Number(row.bytes || 0);
    },
    cleanup: (retentionDays = getSettings(database).logRetentionDays) => {
      if (retentionDays <= 0) return 0;
      const cutoff = new Date(Date.now() - retentionDays * 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      return Number(
        database.query("DELETE FROM generation_log WHERE created_at < ?").run(cutoff).changes
      );
    },
    clear: () => Number(database.query("DELETE FROM generation_log").run().changes),
  };
}
