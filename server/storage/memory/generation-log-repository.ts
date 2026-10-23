import type { GenerationLog, SyncGenerationLogRepository } from "../repositories";
import { clone, safeLimit } from "./utils";

export function createMemoryGenerationLogRepository(
  getRetentionDays: () => number
): SyncGenerationLogRepository {
  const logs = new Map<number, GenerationLog>();
  let nextLogId = 1;
  const generationLogs = {
    append(
      success: boolean,
      mode: "custom" | "remote",
      resultCode: string,
      detail: Record<string, string | number | boolean> = {},
      error = ""
    ) {
      const id = nextLogId++;
      logs.set(id, {
        id,
        success,
        mode,
        result_code: resultCode,
        detail: clone(detail),
        error,
        created_at: new Date().toISOString(),
      });
    },
    list(limit = 20, offset = 0, beforeId = 0) {
      const all = [...logs.values()].sort((a, b) => b.id - a.id);
      const filtered =
        beforeId > 0
          ? all.filter((x) => x.id < beforeId)
          : all.slice(Math.max(0, Math.floor(offset) || 0));
      return filtered.slice(0, safeLimit(limit, 20)).map(clone);
    },
    count: () => logs.size,
    storageBytes: () =>
      [...logs.values()].reduce(
        (sum, item) =>
          sum +
          item.result_code.length +
          JSON.stringify(item.detail).length +
          item.error.length +
          item.mode.length +
          48,
        0
      ),
    cleanup(retentionDays = getRetentionDays()) {
      if (retentionDays <= 0) return 0;
      const cutoff = Date.now() - retentionDays * 86400000;
      let deleted = 0;
      for (const [id, item] of logs)
        if (Date.parse(item.created_at) < cutoff) {
          logs.delete(id);
          deleted++;
        }
      return deleted;
    },
    clear() {
      const count = logs.size;
      logs.clear();
      return count;
    },
  };
  return generationLogs;
}
