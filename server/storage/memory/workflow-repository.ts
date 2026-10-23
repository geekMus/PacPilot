import type { WorkflowRun, WorkflowStage } from "../../../shared/contracts";
import type { WorkflowRepository } from "../repositories";
import { clone, safeLimit } from "./utils";

export type MemoryWorkflowRepository = WorkflowRepository & { reset(): void };

export function createMemoryWorkflowRepository(): MemoryWorkflowRepository {
  const runs = new Map<number, WorkflowRun>();
  const stages = new Map<number, WorkflowStage>();
  let nextRunId = 1;
  let nextStageId = 1;
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
      if (!runs.has(runId)) throw new Error("Cannot create a stage for an unknown workflow run.");
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
  return Object.assign(workflows, { reset() { runs.clear(); stages.clear(); } });
}
