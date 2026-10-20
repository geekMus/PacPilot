import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type { AppSettings, GenerationMode } from "./settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "./settings";

/** Bun 内置 SQLite 连接类型 */
export type AppDatabase = Database;

let db: AppDatabase | null = null;

export function getDb(dataDir: string): AppDatabase {
  if (db) return db;

  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "genpac.db");
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(database: AppDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      success    INTEGER NOT NULL,
      mode       TEXT NOT NULL,
      message    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      category TEXT NOT NULL,
      source_ip TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL,
      duration_ms REAL NOT NULL DEFAULT 0,
      response_bytes INTEGER NOT NULL DEFAULT 0,
      query_string TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL DEFAULT '',
      referer TEXT NOT NULL DEFAULT '',
      accept TEXT NOT NULL DEFAULT '',
      accept_language TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT '',
      request_headers TEXT NOT NULL DEFAULT '',
      response_content_type TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_access_events_source_created ON access_events(source_ip, created_at DESC);

    CREATE TABLE IF NOT EXISTS proxy_probe_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tested_at TEXT NOT NULL,
      proxy_label TEXT NOT NULL,
      proxy_host TEXT NOT NULL,
      proxy_port INTEGER NOT NULL,
      target_host TEXT NOT NULL,
      success INTEGER NOT NULL,
      tcp_ms REAL,
      handshake_ms REAL,
      target_ms REAL,
      http_status INTEGER,
      phase TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_proxy_probe_tested_at ON proxy_probe_runs(tested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proxy_probe_label_tested ON proxy_probe_runs(proxy_label, tested_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      stage_key TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_stages_run ON workflow_stages(run_id, id);
  `);

  ensureAccessEventDetailColumns(database);
  ensureWorkflowStageDetailColumn(database);

  const row = database
    .query("SELECT value FROM settings WHERE key = ?")
    .get("config") as { value: string } | null;

  if (!row) {
    setSettings(database, DEFAULT_SETTINGS);
  }
}

function ensureWorkflowStageDetailColumn(database: AppDatabase): void {
  const existing = new Set(
    (database.query("PRAGMA table_info(workflow_stages)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  if (!existing.has("detail")) {
    database.exec("ALTER TABLE workflow_stages ADD COLUMN detail TEXT NOT NULL DEFAULT ''");
  }
}

/** Additive columns for richer access-log detail views (safe on existing DBs). */
function ensureAccessEventDetailColumns(database: AppDatabase): void {
  const existing = new Set(
    (database.query("PRAGMA table_info(access_events)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  const columns: Array<[string, string]> = [
    ["query_string", "TEXT NOT NULL DEFAULT ''"],
    ["host", "TEXT NOT NULL DEFAULT ''"],
    ["referer", "TEXT NOT NULL DEFAULT ''"],
    ["accept", "TEXT NOT NULL DEFAULT ''"],
    ["accept_language", "TEXT NOT NULL DEFAULT ''"],
    ["content_type", "TEXT NOT NULL DEFAULT ''"],
    ["request_headers", "TEXT NOT NULL DEFAULT ''"],
    ["response_content_type", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      database.exec(`ALTER TABLE access_events ADD COLUMN ${name} ${definition}`);
    }
  }
}

export function getSettings(database: AppDatabase = db!): AppSettings {
  const row = database
    .query("SELECT value FROM settings WHERE key = ?")
    .get("config") as { value: string } | null;

  if (!row) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>;
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(
  database: AppDatabase,
  settings: AppSettings
): void {
  const normalized = normalizeSettings(settings);
  database
    .query(
      `INSERT INTO settings (key, value) VALUES ('config', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(JSON.stringify(normalized));
}

export function updateSettings(
  database: AppDatabase,
  patch: Partial<AppSettings>
): AppSettings {
  const current = getSettings(database);
  const next = normalizeSettings({ ...current, ...patch });
  setSettings(database, next);
  return next;
}

export function appendGenerationLog(
  database: AppDatabase,
  success: boolean,
  mode: GenerationMode,
  message: string
): void {
  database
    .query(
      `INSERT INTO generation_log (success, mode, message) VALUES (?, ?, ?)`
    )
    .run(success ? 1 : 0, mode, message);
}

export function recentLogs(
  database: AppDatabase,
  limit = 20,
  timeZone = "Asia/Shanghai",
  offset = 0,
  beforeId = 0
): Array<{
  id: number;
  success: boolean;
  mode: string;
  message: string | null;
  created_at: string;
}> {
  const safeLimit = Math.max(1, Math.min(101, Math.trunc(limit) || 20));
  const cursor = Math.max(0, Math.trunc(beforeId) || 0);
  const rows = (cursor > 0
    ? database.query("SELECT id, success, mode, message, created_at FROM generation_log WHERE id < ? ORDER BY id DESC LIMIT ?").all(cursor, safeLimit)
    : database.query("SELECT id, success, mode, message, created_at FROM generation_log ORDER BY id DESC LIMIT ? OFFSET ?").all(safeLimit, Math.max(0, Math.trunc(offset) || 0))) as Array<{
    id: number;
    success: number;
    mode: string;
    message: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    success: Boolean(r.success),
    mode: r.mode,
    message: r.message,
    created_at: (() => {
      const parsed = new Date(r.created_at.replace(" ", "T") + "Z");
      return Number.isNaN(parsed.getTime()) ? r.created_at : parsed.toLocaleString("zh-CN", { timeZone });
    })(),
  }));
}

function normalizeTimeZone(value:string):string {try{new Intl.DateTimeFormat("en-US",{timeZone:value.trim()}).format(new Date());return value.trim();}catch{return DEFAULT_SETTINGS.timezone;}}
function normalizeLocale(raw: unknown): import("./settings").AppLocale {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "en" || value === "en-us" || value === "english") return "en";
  return "zh";
}

function normalizeSettings(
  s: AppSettings & { gfwlistUrl?: string; mode?: string }
): AppSettings {
  const webhookSuccessUrl = String(s.webhookSuccessUrl || "").trim();
  const webhookSuccessBody = String(s.webhookSuccessBody || "");
  const webhookFailureUrl = String(s.webhookFailureUrl || "").trim();
  const webhookFailureBody = String(s.webhookFailureBody || "");
  const webhookSuccessConfig = normalizeWebhookConfig(s.webhookSuccessConfig, webhookSuccessUrl, webhookSuccessBody);
  const webhookFailureConfig = normalizeWebhookConfig(s.webhookFailureConfig, webhookFailureUrl, webhookFailureBody);

  // Old config rows are merged with defaults before normalization. Migrate a blank new target from legacy URL/Body fields.
  if (!webhookSuccessConfig.url && !webhookSuccessConfig.body && (webhookSuccessUrl || webhookSuccessBody)) {
    webhookSuccessConfig.url = webhookSuccessUrl;
    webhookSuccessConfig.body = webhookSuccessBody;
  }
  if (!webhookFailureConfig.url && !webhookFailureConfig.body && (webhookFailureUrl || webhookFailureBody)) {
    webhookFailureConfig.url = webhookFailureUrl;
    webhookFailureConfig.body = webhookFailureBody;
  }

  const rawMode = String(s.mode || "");
  const mode: GenerationMode =
    rawMode === "remote" || rawMode === "genpac" ? "remote" : "custom";

  return {
    mode,
    pacProxy: String(s.pacProxy || DEFAULT_SETTINGS.pacProxy).trim(),
    pacCompress: Boolean(s.pacCompress),
    listUrl: String(s.listUrl || s.gfwlistUrl || "").trim(),
    blockList: Array.isArray(s.blockList)
      ? s.blockList.map((x) => String(x).trim()).filter(Boolean)
      : [],
    directList: Array.isArray(s.directList)
      ? s.directList.map((x) => String(x).trim()).filter(Boolean)
      : [],
    cronSchedule: String(s.cronSchedule || "").trim(),
    timezone: normalizeTimeZone(String(s.timezone || DEFAULT_SETTINGS.timezone)),
    locale: normalizeLocale((s as { locale?: unknown }).locale ?? DEFAULT_SETTINGS.locale),
    proxyTestUrl: String(s.proxyTestUrl || DEFAULT_SETTINGS.proxyTestUrl).trim(),
    logRetentionDays: Math.max(0, Math.min(3650, Math.floor(Number(s.logRetentionDays ?? DEFAULT_SETTINGS.logRetentionDays) || 0))),
    webhookSuccessUrl,
    webhookSuccessBody,
    webhookFailureUrl,
    webhookFailureBody,
    webhookSuccessConfig,
    webhookFailureConfig,
  };
}


export type WorkflowStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export interface WorkflowRun {
  id: number;
  source: string;
  status: WorkflowStatus;
  stage: string;
  mode: string;
  message: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}
export function createWorkflowRun(database: AppDatabase, source: string, mode: string): number {
  const now = new Date().toISOString();
  const result = database.query(
    "INSERT INTO workflow_runs (source,status,stage,mode,message,error,created_at) VALUES (?,'pending','等待执行',?,'任务已创建','',?)"
  ).run(source, mode, now);
  return Number(result.lastInsertRowid);
}
export function updateWorkflowRun(
  database: AppDatabase,
  id: number,
  patch: Partial<Pick<WorkflowRun, "status" | "stage" | "message" | "error" | "started_at" | "finished_at" | "duration_ms">>
): void {
  const allowed = ["status", "stage", "message", "error", "started_at", "finished_at", "duration_ms"] as const;
  const fields = allowed.filter((key) => patch[key] !== undefined);
  if (!fields.length) return;
  database.query("UPDATE workflow_runs SET " + fields.map((key) => key + " = ?").join(", ") + " WHERE id = ?")
    .run(...fields.map((key) => patch[key] as string | number | null), id);

  // A terminal workflow must never leave active/pending stages behind.
  if (patch.status === "succeeded" || patch.status === "failed" || patch.status === "cancelled") {
    const finishedAt = patch.finished_at ?? new Date().toISOString();
    const fallbackError = patch.error || "工作流已结束，但该阶段未正常收尾";
    database.query(`
      UPDATE workflow_stages
      SET status = CASE WHEN status = 'running' THEN 'failed' ELSE 'skipped' END,
          message = CASE WHEN status = 'running' THEN '工作流已结束，阶段未正常收尾' ELSE '工作流已结束，未执行的阶段已跳过' END,
          error = CASE WHEN status = 'running' THEN ? ELSE '' END,
          finished_at = COALESCE(finished_at, ?),
          duration_ms = CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)) END
      WHERE run_id = ? AND status IN ('running', 'pending')
    `).run(fallbackError, finishedAt, finishedAt, id);
  }
}
export function listWorkflowRuns(database: AppDatabase, limit = 50, beforeId = 0): WorkflowRun[] {
  const safeLimit = Math.max(1, Math.min(101, Math.floor(limit) || 50));
  const cursor = Math.max(0, Math.floor(beforeId) || 0);
  if (cursor > 0) {
    return database.query("SELECT * FROM workflow_runs WHERE id < ? ORDER BY id DESC LIMIT ?").all(cursor, safeLimit) as WorkflowRun[];
  }
  return database.query("SELECT * FROM workflow_runs ORDER BY id DESC LIMIT ?").all(safeLimit) as WorkflowRun[];
}
export function listActiveWorkflowRuns(database: AppDatabase): WorkflowRun[] {
  return database.query("SELECT * FROM workflow_runs WHERE status IN ('pending','running') ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, id ASC").all() as WorkflowRun[];
}
export function getCurrentWorkflow(database: AppDatabase): WorkflowRun | null {
  return (database.query("SELECT * FROM workflow_runs WHERE status IN ('pending','running') ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, id ASC LIMIT 1").get() as WorkflowRun | null) ?? null;
}
export function markInterruptedWorkflows(database: AppDatabase): void {
  const now = new Date().toISOString();
  database.query("UPDATE workflow_runs SET status='failed', stage='进程中断', error='服务进程重启，任务未能正常完成', message='任务已中断', finished_at=?, duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)) END WHERE status IN ('pending','running')")
    .run(now, now);

  // Repair both newly interrupted runs and older terminal runs with stale stages.
  database.query(`
    UPDATE workflow_stages
    SET status = CASE WHEN status = 'running' THEN 'failed' ELSE 'skipped' END,
        message = CASE WHEN status = 'running' THEN '工作流未正常结束，该阶段已标记为失败' ELSE '工作流已结束，未执行的阶段已跳过' END,
        error = CASE
          WHEN status = 'running' THEN COALESCE(
            (SELECT NULLIF(error, '') FROM workflow_runs WHERE workflow_runs.id = workflow_stages.run_id),
            '工作流未正常结束，该阶段已标记为失败'
          )
          ELSE ''
        END,
        finished_at = COALESCE(finished_at, ?),
        duration_ms = CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0, CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)) END
    WHERE status IN ('running', 'pending')
      AND run_id IN (SELECT id FROM workflow_runs WHERE status IN ('succeeded', 'failed', 'cancelled'))
  `).run(now, now);
}
export function cleanupOperationalLogs(database: AppDatabase, retentionDays = getSettings(database).logRetentionDays): { generationLogs: number; accessEvents: number; proxyProbeRuns: number } {
  if (retentionDays <= 0) return { generationLogs: 0, accessEvents: 0, proxyProbeRuns: 0 };
  const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
  // generation_log.created_at uses SQLite's UTC "YYYY-MM-DD HH:mm:ss" format;
  // access/probe timestamps use ISO 8601. Compare each table in its stored format.
  const cutoffIso = cutoffDate.toISOString();
  const cutoffSql = cutoffIso.slice(0, 19).replace("T", " ");
  const generationLogs = Number(database.query("DELETE FROM generation_log WHERE created_at < ?").run(cutoffSql).changes);
  const accessEvents = Number(database.query("DELETE FROM access_events WHERE created_at < ?").run(cutoffIso).changes);
  const proxyProbeRuns = Number(database.query("DELETE FROM proxy_probe_runs WHERE tested_at < ?").run(cutoffIso).changes);
  return { generationLogs, accessEvents, proxyProbeRuns };
}
/** Delete operational logs without touching workflow execution history. */
export function clearOperationalLogs(database: AppDatabase): { generationLogs: number; accessEvents: number; proxyProbeRuns: number } {
  database.exec("BEGIN IMMEDIATE");
  try {
    const generationLogs = Number(database.query("DELETE FROM generation_log").run().changes);
    const accessEvents = Number(database.query("DELETE FROM access_events").run().changes);
    const proxyProbeRuns = Number(database.query("DELETE FROM proxy_probe_runs").run().changes);
    database.exec("COMMIT");
    return { generationLogs, accessEvents, proxyProbeRuns };
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  }
}

export function operationalLogStorageBytes(database: AppDatabase): number {
  const row = database.query(`
    SELECT
      COALESCE((SELECT SUM(length(COALESCE(message,'')) + length(mode) + 48) FROM generation_log),0) +
      COALESCE((SELECT SUM(length(path) + length(category) + length(source_ip) + length(user_agent) + 96) FROM access_events),0) +
      COALESCE((SELECT SUM(length(proxy_label) + length(proxy_host) + length(target_host) + length(error) + 96) FROM proxy_probe_runs),0)
      AS bytes
  `).get() as { bytes: number };
  return Number(row.bytes || 0);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}


export interface WorkflowStage {
  id: number; run_id: number; stage_key: string; name: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  message: string; error: string; detail: string;
  started_at: string | null; finished_at: string | null; duration_ms: number | null;
}
export function startWorkflowStage(database: AppDatabase, runId: number, stageKey: string, name: string, message: string, detail = ""): number {
  const now = new Date().toISOString();
  const result = database.query(
    "INSERT INTO workflow_stages (run_id,stage_key,name,status,message,detail,started_at) VALUES (?,?,?,'running',?,?,?)"
  ).run(runId, stageKey, name, message, detail || "", now);
  return Number(result.lastInsertRowid);
}
export function finishWorkflowStage(
  database: AppDatabase,
  stageId: number,
  status: "succeeded" | "failed" | "skipped",
  message: string,
  error = "",
  detail = ""
): void {
  const now = new Date().toISOString();
  database.query(
    "UPDATE workflow_stages SET status=?,message=?,error=?,detail=CASE WHEN ? <> '' THEN ? ELSE detail END,finished_at=?,duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0,CAST((julianday(?) - julianday(started_at))*86400000 AS INTEGER)) END WHERE id=?"
  ).run(status, message, error, detail || "", detail || "", now, now, stageId);
}
export function encodeWorkflowStageDetail(value: unknown): string {
  try {
    const json = JSON.stringify(value ?? {});
    return json.length > 32000 ? json.slice(0, 32000) : json;
  } catch {
    return "";
  }
}
/** Cancel a queued execution only. Running tasks are intentionally not interrupted. */
export function cancelPendingWorkflow(database: AppDatabase, id: number): "cancelled" | "not-found" | "not-pending" {
  const run = getWorkflowRun(database, id);
  if (!run) return "not-found";
  if (run.status !== "pending") return "not-pending";
  const now = new Date().toISOString();
  const result = database.query("UPDATE workflow_runs SET status='cancelled', stage='已取消', message='任务在等待期间被取消', error='', finished_at=? WHERE id=? AND status='pending'").run(now, id);
  return Number(result.changes) > 0 ? "cancelled" : "not-pending";
}

export function getWorkflowRun(database: AppDatabase, id: number): WorkflowRun | null {
  return (database.query("SELECT * FROM workflow_runs WHERE id = ?").get(id) as WorkflowRun | null) ?? null;
}
export function listWorkflowStages(database: AppDatabase, runId: number): WorkflowStage[] {
  return database.query("SELECT * FROM workflow_stages WHERE run_id = ? ORDER BY id").all(runId) as WorkflowStage[];
}


/** Clear all execution history and stage timelines, but never while a workflow is active. */
export function clearWorkflowHistory(database: AppDatabase): { deletedRuns: number; activeRuns: number } {
  database.exec("BEGIN IMMEDIATE");
  try {
    const activeRow = database.query("SELECT COUNT(*) AS count FROM workflow_runs WHERE status IN ('pending','running')").get() as { count: number };
    const activeRuns = Number(activeRow.count || 0);
    if (activeRuns > 0) {
      database.exec("ROLLBACK");
      return { deletedRuns: 0, activeRuns };
    }
    const deletedRuns = Number(database.query("DELETE FROM workflow_runs").run().changes);
    database.exec("COMMIT");
    return { deletedRuns, activeRuns: 0 };
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  }
}

/** Delete one terminal workflow execution and its stage timeline. Active runs cannot be removed. */
export function deleteWorkflowRun(database: AppDatabase, id: number): "deleted" | "not-found" | "active" {
  const run = getWorkflowRun(database, id);
  if (!run) return "not-found";
  if (run.status === "pending" || run.status === "running") return "active";
  database.query("DELETE FROM workflow_runs WHERE id = ? AND status NOT IN ('pending','running')").run(id);
  return getWorkflowRun(database, id) ? "active" : "deleted";
}
