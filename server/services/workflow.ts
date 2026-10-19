import type { AppDatabase } from "../db/sqlite";
import {
  createWorkflowRun,
  getCurrentWorkflow,
  getSettings,
  updateWorkflowRun,
} from "../db/sqlite";
import { generatePac, type GenerateResult } from "./pac-generator";

export type WorkflowSource = "startup" | "scheduled" | "manual" | "save-and-generate";
export interface PacWorkflowResult {
  workflowId: number;
  generation: GenerateResult;
}
let active = false;

export function hasActivePacWorkflow(database: AppDatabase): boolean {
  return active || getCurrentWorkflow(database) !== null;
}

/**
 * Serializes every PAC generation trigger and records the full lifecycle.
 * The work is server-owned, so closing a browser does not cancel it.
 */
export async function runPacWorkflow(
  database: AppDatabase,
  dataDir: string,
  source: WorkflowSource
): Promise<PacWorkflowResult> {
  if (active || getCurrentWorkflow(database)) {
    throw new Error("已有 PAC 工作流正在执行，请等待当前任务完成后再试。");
  }
  active = true;
  let workflowId: number | null = null;
  const startedAt = new Date();
  try {
    const mode = getSettings(database).mode;
    const id = createWorkflowRun(database, source, mode);
    workflowId = id;
    updateWorkflowRun(database, id, {
      status: "running",
      stage: "生成 PAC",
      message: "正在读取配置并生成 PAC 文件",
      started_at: startedAt.toISOString(),
    });
    const generation = await generatePac(database, dataDir);
    const finishedAt = new Date();
    updateWorkflowRun(database, id, {
      status: generation.success ? "succeeded" : "failed",
      stage: generation.success ? "已完成" : "生成失败",
      message: generation.message,
      error: generation.success ? "" : generation.message,
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    });
    return { workflowId: id, generation };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    if (workflowId !== null) {
      try {
        updateWorkflowRun(database, workflowId, {
          status: "failed",
          stage: "执行异常",
          message: "工作流执行异常",
          error: message,
          finished_at: finishedAt.toISOString(),
          duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        });
      } catch (recordError) {
        console.error("[workflow] failed to persist task failure:", recordError);
      }
    }
    throw error;
  } finally {
    active = false;
  }
}
