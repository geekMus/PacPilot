import type { AppDatabase } from "./sqlite";
import type { WorkflowRun, WorkflowStage } from "../../../shared/contracts";
export type { WorkflowRun, WorkflowStage, WorkflowStatus } from "../../shared/contracts";

export function createWorkflowRun(database: AppDatabase, source: string, mode: string): number {
  const now = new Date().toISOString();
  const result = database
    .query(
      "INSERT INTO workflow_runs (source,status,stage,mode,error,created_at) VALUES (?,'pending','queued',?,'',?)"
    )
    .run(source, mode, now);
  return Number(result.lastInsertRowid);
}

/** Atomically claims a pending workflow so cancellation cannot race with execution. */
export function claimWorkflowRun(database: AppDatabase, id: number, startedAt: string): boolean {
  const result = database
    .query(
      "UPDATE workflow_runs SET status='running', stage='prepare', started_at=? WHERE id=? AND status='pending'"
    )
    .run(startedAt, id);
  return Number(result.changes) === 1;
}

type WorkflowRunPatch = Partial<
  Pick<
    WorkflowRun,
    "status" | "stage" | "mode" | "error" | "started_at" | "finished_at" | "duration_ms"
  >
>;

export function updateWorkflowRun(
  database: AppDatabase,
  id: number,
  patch: WorkflowRunPatch
): void {
  const updates: Array<[string, string | number | null]> = [];
  for (const key of [
    "status",
    "stage",
    "mode",
    "error",
    "started_at",
    "finished_at",
    "duration_ms",
  ] as const) {
    const value = patch[key];
    if (value !== undefined) updates.push([key, value]);
  }
  if (!updates.length) return;
  database
    .query(
      "UPDATE workflow_runs SET " +
        updates.map(([key]) => key + " = ?").join(", ") +
        " WHERE id = ?"
    )
    .run(...updates.map(([, value]) => value), id);

  if (patch.status === "succeeded" || patch.status === "failed" || patch.status === "cancelled") {
    const finishedAt = patch.finished_at ?? new Date().toISOString();
    const fallbackError = patch.error ?? "";
    database
      .query(
        `
      UPDATE workflow_stages
      SET status = CASE WHEN status = 'running' THEN 'failed' ELSE 'skipped' END,
          error = CASE WHEN status = 'running' THEN ? ELSE '' END,
          finished_at = COALESCE(finished_at, ?),
          duration_ms = CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)) END
      WHERE run_id = ? AND status IN ('running', 'pending')
    `
      )
      .run(fallbackError, finishedAt, finishedAt, id);
  }
}

export function listWorkflowRuns(database: AppDatabase, limit = 50, beforeId = 0): WorkflowRun[] {
  const safeLimit = Math.max(1, Math.min(101, Math.floor(limit) || 50));
  const cursor = Math.max(0, Math.floor(beforeId) || 0);
  if (cursor > 0) {
    return database
      .query("SELECT * FROM workflow_runs WHERE id < ? ORDER BY id DESC LIMIT ?")
      .all(cursor, safeLimit) as WorkflowRun[];
  }
  return database
    .query("SELECT * FROM workflow_runs ORDER BY id DESC LIMIT ?")
    .all(safeLimit) as WorkflowRun[];
}

export function listActiveWorkflowRuns(database: AppDatabase): WorkflowRun[] {
  return database
    .query(
      "SELECT * FROM workflow_runs WHERE status IN ('pending','running') ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, id ASC"
    )
    .all() as WorkflowRun[];
}

export function getCurrentWorkflow(database: AppDatabase): WorkflowRun | null {
  return database
    .query(
      "SELECT * FROM workflow_runs WHERE status IN ('pending','running') ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, id ASC LIMIT 1"
    )
    .get() as WorkflowRun | null;
}

export function markInterruptedWorkflows(database: AppDatabase): void {
  const now = new Date().toISOString();
  database
    .query(
      "UPDATE workflow_runs SET status='failed', stage='interrupted', error='服务在工作流完成前退出。', finished_at=?, duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)) END WHERE status IN ('pending','running')"
    )
    .run(now, now);

  database
    .query(
      `
    UPDATE workflow_stages
    SET status = CASE WHEN status = 'running' THEN 'failed' ELSE 'skipped' END,
        error = CASE WHEN status = 'running' THEN '服务在工作流完成前退出。' ELSE '' END,
        finished_at = COALESCE(finished_at, ?),
        duration_ms = CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)) END
    WHERE status IN ('running', 'pending')
      AND run_id IN (SELECT id FROM workflow_runs WHERE status IN ('succeeded', 'failed', 'cancelled'))
  `
    )
    .run(now, now);
}

export function startWorkflowStage(
  database: AppDatabase,
  runId: number,
  stageKey: string,
  detail = ""
): number {
  const now = new Date().toISOString();
  const result = database
    .query(
      "INSERT INTO workflow_stages (run_id,stage_key,status,detail,started_at) VALUES (?,?,'running',?,?)"
    )
    .run(runId, stageKey, detail || "", now);
  return Number(result.lastInsertRowid);
}

export function finishWorkflowStage(
  database: AppDatabase,
  stageId: number,
  status: "succeeded" | "failed" | "skipped",
  error = "",
  detail = ""
): void {
  const now = new Date().toISOString();
  database
    .query(
      "UPDATE workflow_stages SET status=?,error=?,detail=CASE WHEN ? <> '' THEN ? ELSE detail END,finished_at=?,duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0,CAST((julianday(?) - julianday(started_at))*86400000 AS INTEGER)) END WHERE id=?"
    )
    .run(status, error, detail || "", detail || "", now, now, stageId);
}

export function encodeWorkflowStageDetail(value: unknown): string {
  const json = JSON.stringify(value ?? {});
  if (json === undefined) throw new Error("Workflow stage detail is not JSON-serializable.");
  return json.length > 32000
    ? JSON.stringify({ truncated: true, originalLength: json.length })
    : json;
}

export function cancelPendingWorkflow(
  database: AppDatabase,
  id: number
): "cancelled" | "not-found" | "not-pending" {
  const run = getWorkflowRun(database, id);
  if (!run) return "not-found";
  if (run.status !== "pending") return "not-pending";
  const now = new Date().toISOString();
  const result = database
    .query(
      "UPDATE workflow_runs SET status='cancelled', stage='cancelled', error='', finished_at=? WHERE id=? AND status='pending'"
    )
    .run(now, id);
  return Number(result.changes) > 0 ? "cancelled" : "not-pending";
}

export function getWorkflowRun(database: AppDatabase, id: number): WorkflowRun | null {
  return database.query("SELECT * FROM workflow_runs WHERE id = ?").get(id) as WorkflowRun | null;
}

export function listWorkflowStages(database: AppDatabase, runId: number): WorkflowStage[] {
  return database
    .query("SELECT * FROM workflow_stages WHERE run_id = ? ORDER BY id")
    .all(runId) as WorkflowStage[];
}

export function clearWorkflowHistory(database: AppDatabase): {
  deletedRuns: number;
  activeRuns: number;
} {
  database.run("BEGIN IMMEDIATE");
  try {
    const activeRow = database
      .query("SELECT COUNT(*) AS count FROM workflow_runs WHERE status IN ('pending','running')")
      .get() as { count: number };
    const activeRuns = Number(activeRow.count || 0);
    if (activeRuns > 0) {
      database.run("ROLLBACK");
      return { deletedRuns: 0, activeRuns };
    }
    const deletedRuns = Number(database.query("DELETE FROM workflow_runs").run().changes);
    database.run("COMMIT");
    return { deletedRuns, activeRuns: 0 };
  } catch (error) {
    try {
      database.run("ROLLBACK");
    } catch {
      /* transaction may already be closed */
    }
    throw error;
  }
}

export function deleteWorkflowRun(
  database: AppDatabase,
  id: number
): "deleted" | "not-found" | "active" {
  const run = getWorkflowRun(database, id);
  if (!run) return "not-found";
  if (run.status === "pending" || run.status === "running") return "active";
  database
    .query("DELETE FROM workflow_runs WHERE id = ? AND status NOT IN ('pending','running')")
    .run(id);
  return getWorkflowRun(database, id) ? "active" : "deleted";
}
