import type { GenerationMode } from "../../domain/settings";
import type { AppDatabase } from "./database";

export function appendGenerationLog(
  database: AppDatabase,
  success: boolean,
  mode: GenerationMode,
  resultCode: string,
  detail: Record<string, string | number | boolean> = {},
  error = ""
): void {
  database
    .query(
      `INSERT INTO generation_log (success, mode, result_code, detail, error) VALUES (?, ?, ?, ?, ?)`
    )
    .run(success ? 1 : 0, mode, resultCode, JSON.stringify(detail), error);
}

function parseRecord(value: string): Record<string, string | number | boolean> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored generation log detail must be a JSON object.");
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      result[key] = entry;
    }
  }
  return result;
}

export function recentLogs(
  database: AppDatabase,
  limit = 20,
  offset = 0,
  beforeId = 0
): Array<{
  id: number;
  success: boolean;
  mode: string;
  result_code: string;
  detail: Record<string, string | number | boolean>;
  error: string;
  created_at: string;
}> {
  const safeLimit = Math.max(1, Math.min(101, Math.trunc(limit) || 20));
  const cursor = Math.max(0, Math.trunc(beforeId) || 0);
  const rows = (
    cursor > 0
      ? database
          .query(
            "SELECT id, success, mode, result_code, detail, error, created_at FROM generation_log WHERE id < ? ORDER BY id DESC LIMIT ?"
          )
          .all(cursor, safeLimit)
      : database
          .query(
            "SELECT id, success, mode, result_code, detail, error, created_at FROM generation_log ORDER BY id DESC LIMIT ? OFFSET ?"
          )
          .all(safeLimit, Math.max(0, Math.trunc(offset) || 0))
  ) as Array<{
    id: number;
    success: number;
    mode: string;
    result_code: string;
    detail: string;
    error: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    success: Boolean(r.success),
    mode: r.mode,
    result_code: r.result_code,
    detail: parseRecord(r.detail),
    error: r.error,
    created_at: r.created_at.replace(" ", "T") + "Z",
  }));
}
export function countGenerationLogs(database: AppDatabase): number {
  return Number((database.query("SELECT COUNT(*) AS total FROM generation_log").get() as { total: number }).total);
}
