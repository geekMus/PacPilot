import type { AppSettings, WorkflowRun, WorkflowStage } from "../../../shared/contracts";
import { DEFAULT_SETTINGS, normalizeAppSettings } from "../../domain/settings";
import type {
  AccessEvent,
  AccessEventInput,
  ApplicationStorage,
  GenerationLog,
  MonitorSummary,
} from "../repositories";
import { MemoryAdminCredentialRepository } from "./admin-credential-repository";
import { normalizeArtifactKey } from "../artifact-key";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function safeLimit(value: number | undefined, fallback: number, max = 101): number {
  return Math.max(1, Math.min(max, Math.floor(Number(value) || fallback)));
}

function createMemoryArtifacts() {
  const files = new Map<string, { bytes: Uint8Array; modifiedAt: string }>();
  return {
    read(key: string) { const item = files.get(normalizeArtifactKey(key)); return item ? new Uint8Array(item.bytes) : undefined; },
    write(key: string, contents: Uint8Array | string) {
      const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : new Uint8Array(contents);
      files.set(normalizeArtifactKey(key), { bytes, modifiedAt: new Date().toISOString() });
    },
    delete(key: string) { return files.delete(normalizeArtifactKey(key)); },
    exists(key: string) { return files.has(normalizeArtifactKey(key)); },
    list(prefix = "") {
      const normalized = prefix ? normalizeArtifactKey(prefix) : "";
      return [...files.keys()].filter((key) => key.startsWith(normalized)).sort();
    },
    stat(key: string) {
      const item = files.get(normalizeArtifactKey(key));
      if (!item) return undefined;
      return { size: item.bytes.byteLength, modifiedAt: item.modifiedAt };
    },
    totalBytes() { return [...files.values()].reduce((sum, item) => sum + item.bytes.byteLength, 0); },
    clear() { files.clear(); },
  };
}

/** Full in-process implementation. It does not import or initialize a database driver. */
export function createMemoryApplicationStorage(): ApplicationStorage {
  let settings = normalizeAppSettings(DEFAULT_SETTINGS);
  const credentials = new MemoryAdminCredentialRepository();
  const artifacts = createMemoryArtifacts();
  const logs = new Map<number, GenerationLog>();
  const events = new Map<number, AccessEvent>();
  const runs = new Map<number, WorkflowRun>();
  const stages = new Map<number, WorkflowStage>();
  let nextLogId = 1, nextEventId = 1, nextRunId = 1, nextStageId = 1;
  let closed = false;

  const generationLogs = {
    append(success: boolean, mode: "custom" | "remote", resultCode: string, detail: Record<string, string | number | boolean> = {}, error = "") {
      const id = nextLogId++;
      logs.set(id, { id, success, mode, result_code: resultCode, detail: clone(detail), error, created_at: new Date().toISOString() });
    },
    list(limit = 20, offset = 0, beforeId = 0) {
      const all = [...logs.values()].sort((a, b) => b.id - a.id);
      const filtered = beforeId > 0 ? all.filter((x) => x.id < beforeId) : all.slice(Math.max(0, Math.floor(offset) || 0));
      return filtered.slice(0, safeLimit(limit, 20)).map(clone);
    },
    count: () => logs.size,
    storageBytes: () => [...logs.values()].reduce((sum, item) => sum + item.result_code.length + JSON.stringify(item.detail).length + item.error.length + item.mode.length + 48, 0),
    cleanup(retentionDays = settings.logRetentionDays) {
      if (retentionDays <= 0) return 0;
      const cutoff = Date.now() - retentionDays * 86400000;
      let deleted = 0;
      for (const [id, item] of logs) if (Date.parse(item.created_at) < cutoff) { logs.delete(id); deleted++; }
      return deleted;
    },
    clear() { const count = logs.size; logs.clear(); return count; },
  };

  const monitoring = {
    record(event: AccessEventInput) {
      const id = nextEventId++;
      events.set(id, { ...clone(event), id });
      const cutoff = Date.now() - 7 * 86400000;
      for (const [eventId, item] of events) if (Date.parse(item.created_at) < cutoff) events.delete(eventId);
      while (events.size > 5000) events.delete(events.keys().next().value!);
    },
    list(limit = 50, beforeId = 0) {
      const all = [...events.values()].sort((a, b) => b.id - a.id);
      return (beforeId > 0 ? all.filter((x) => x.id < beforeId) : all).slice(0, safeLimit(limit, 50, 201)).map(clone);
    },
    count: () => events.size,
    storageBytes: () => [...events.values()].reduce((sum, e) => sum + e.path.length + e.category.length + e.source_ip.length + e.user_agent.length + 96, 0),
    cleanup(retentionDays = settings.logRetentionDays) {
      if (retentionDays <= 0) return 0;
      const cutoff = Date.now() - retentionDays * 86400000;
      let deleted = 0;
      for (const [id, item] of events) if (Date.parse(item.created_at) < cutoff) { events.delete(id); deleted++; }
      return deleted;
    },
    clear() { const count = events.size; events.clear(); return count; },
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
      const p95 = durations.length ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] : 0;
      const uniqueSources = new Set(day.map((e) => e.source_ip).filter((ip) => ip !== "unknown")).size;
      const hourly = (items: AccessEvent[], category?: string) => {
        const selected = category ? items.filter((e) => e.category === category) : items;
        const byHour = new Map<string, AccessEvent[]>();
        for (const event of selected) {
          const key = new Date(event.created_at).toISOString().slice(0, 13);
          const list = byHour.get(key) ?? []; list.push(event); byHour.set(key, list);
        }
        const currentHour = Math.floor(now / 3600000) * 3600000;
        return Array.from({ length: 24 }, (_, index) => {
          const slot = new Date(currentHour - (23 - index) * 3600000);
          const values = byHour.get(slot.toISOString().slice(0, 13)) ?? [];
          const failed = values.filter((e) => e.status_code >= 400 || (category === "pac" && e.status_code < 200));
          return {
            hour: slot.toISOString(),
            requests: values.length,
            errors: failed.length,
            averageResponseMs: values.length ? Math.round(values.reduce((sum, e) => sum + e.duration_ms, 0) / values.length * 10) / 10 : 0,
          };
        });
      };
      const latestPac = [...all].filter((e) => e.category === "pac").sort((a, b) => b.id - a.id)[0];
      const average = (items: AccessEvent[]) => items.length ? items.reduce((sum, e) => sum + e.duration_ms, 0) / items.length : 0;
      const pacSuccess = pacDay.filter((e) => e.status_code >= 200 && e.status_code < 400).length;
      return {
        generatedAt: new Date(now).toISOString(), activeRequests: Math.max(0, activeRequests), tcpConnections: Math.max(0, tcpConnections),
        requestsLastHour: hour.length, requestsLast24h: day.length, uniqueSourcesLast24h: uniqueSources,
        errorRequestsLast24h: errors.length, serverErrorsLast24h: serverErrors.length,
        averageResponseMs: Math.round(average(day) * 10) / 10, p95ResponseMs: Math.round(p95 * 10) / 10,
        errorRate: day.length ? Math.round(errors.length / day.length * 1000) / 10 : 0,
        requestTrend: hourly(day), pacRequestsLastHour: pacHour.length, pacRequestsLast24h: pacDay.length,
        pacSuccessRate: pacDay.length ? Math.round(pacSuccess / pacDay.length * 1000) / 10 : 100,
        pacFailureRequestsLast24h: pacDay.filter((e) => e.status_code >= 400 || e.status_code < 200).length,
        pacAverageResponseMs: Math.round(average(pacDay) * 10) / 10,
        latestPacRequest: latestPac ? { created_at: latestPac.created_at, source_ip: latestPac.source_ip, status_code: latestPac.status_code, duration_ms: latestPac.duration_ms } : null,
        pacRequestTrend: hourly(day, "pac"),
      };
    },
  };

  const workflows = {
    create(source: string, mode: string) {
      const id = nextRunId++;
      runs.set(id, { id, source, status: "pending", stage: "queued", mode, error: "", created_at: new Date().toISOString(), started_at: null, finished_at: null, duration_ms: null });
      return id;
    },
    claim(id: number, startedAt: string) {
      const run = runs.get(id);
      if (!run || run.status !== "pending") return false;
      runs.set(id, { ...run, status: "running", stage: "prepare", started_at: startedAt });
      return true;
    },
    update(id: number, patch: Partial<Pick<WorkflowRun, "status" | "stage" | "mode" | "error" | "started_at" | "finished_at" | "duration_ms">>) {
      const run = runs.get(id); if (!run) return;
      runs.set(id, { ...run, ...clone(patch) });
      if (patch.status && ["succeeded", "failed", "cancelled"].includes(patch.status)) {
        const finishedAt = patch.finished_at ?? new Date().toISOString();
        for (const [stageId, stage] of stages) if (stage.run_id === id && ["running", "pending"].includes(stage.status)) {
          const failed = stage.status === "running";
          stages.set(stageId, { ...stage, status: failed ? "failed" : "skipped", error: failed ? (patch.error ?? "") : "", finished_at: stage.finished_at ?? finishedAt, duration_ms: stage.started_at ? Math.max(0, Date.parse(finishedAt) - Date.parse(stage.started_at)) : null });
        }
      }
    },
    list(limit = 50, beforeId = 0) {
      const all = [...runs.values()].sort((a, b) => b.id - a.id);
      return (beforeId > 0 ? all.filter((x) => x.id < beforeId) : all).slice(0, safeLimit(limit, 50)).map(clone);
    },
    count: () => runs.size,
    listActive() { return [...runs.values()].filter((r) => r.status === "pending" || r.status === "running").sort((a, b) => (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1) || a.id - b.id).map(clone); },
    current() { return this.listActive()[0] ?? null; },
    markInterrupted() {
      const now = new Date().toISOString();
      for (const [id, run] of runs) if (run.status === "pending" || run.status === "running") {
        runs.set(id, { ...run, status: "failed", stage: "interrupted", error: "服务在工作流完成前退出。", finished_at: now, duration_ms: run.started_at ? Math.max(0, Date.parse(now) - Date.parse(run.started_at)) : null });
      }
    },
    startStage(runId: number, stageKey: string, detail = "") {
      const id = nextStageId++;
      stages.set(id, { id, run_id: runId, stage_key: stageKey, status: "running", error: "", detail, started_at: new Date().toISOString(), finished_at: null, duration_ms: null });
      return id;
    },
    finishStage(stageId: number, status: "succeeded" | "failed" | "skipped", error = "", detail = "") {
      const stage = stages.get(stageId); if (!stage) return;
      const now = new Date().toISOString();
      stages.set(stageId, { ...stage, status, error, detail: detail || stage.detail, finished_at: now, duration_ms: stage.started_at ? Math.max(0, Date.parse(now) - Date.parse(stage.started_at)) : null });
    },
    get(id: number) { const run = runs.get(id); return run ? clone(run) : null; },
    stages(runId: number) { return [...stages.values()].filter((s) => s.run_id === runId).sort((a, b) => a.id - b.id).map(clone); },
    cancelPending(id: number) {
      const run = runs.get(id); if (!run) return "not-found" as const;
      if (run.status !== "pending") return "not-pending" as const;
      const now = new Date().toISOString();
      runs.set(id, { ...run, status: "cancelled", stage: "cancelled", error: "", finished_at: now });
      return "cancelled" as const;
    },
    clearHistory() {
      const activeRuns = this.listActive().length;
      if (activeRuns) return { deletedRuns: 0, activeRuns };
      const deletedRuns = runs.size; runs.clear(); stages.clear();
      return { deletedRuns, activeRuns: 0 };
    },
    delete(id: number) {
      const run = runs.get(id); if (!run) return "not-found" as const;
      if (run.status === "pending" || run.status === "running") return "active" as const;
      runs.delete(id); for (const [stageId, stage] of stages) if (stage.run_id === id) stages.delete(stageId);
      return "deleted" as const;
    },
  };

  const settingsRepository = {
    get: () => clone(settings),
    set(value: AppSettings) { settings = normalizeAppSettings(value); },
    update(patch: Partial<AppSettings>) { settings = normalizeAppSettings({ ...settings, ...clone(patch) }); return clone(settings); },
  };

  return {
    driver: "memory",
    settings: settingsRepository,
    credentials,
    generationLogs,
    monitoring,
    workflows,
    artifacts,
    maintenance: {
      databaseBytes: () => 0,
      compact: () => {},
      checkpoint: () => {},
      resetOperationalData(value) {
        generationLogs.clear(); monitoring.clear(); runs.clear(); stages.clear(); settingsRepository.set(value);
      },
    },
    close() {
      if (closed) return;
      closed = true;
      settings = normalizeAppSettings(DEFAULT_SETTINGS);
      credentials.clear(); artifacts.clear(); logs.clear(); events.clear(); runs.clear(); stages.clear();
    },
  };
}
