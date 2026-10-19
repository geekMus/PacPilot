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
interface StartedWorkflow {
  workflowId: number;
  promise: Promise<GenerateResult>;
}
let active = false;

export function hasActivePacWorkflow(database: AppDatabase): boolean {
  return active || getCurrentWorkflow(database) !== null;
}

function beginPacWorkflow(database: AppDatabase, dataDir: string, source: WorkflowSource): StartedWorkflow {
  if (active || getCurrentWorkflow(database)) {
    throw new Error("已有 PAC 工作流正在执行，请等待当前任务完成后再试。");
  }
  active = true;
  let workflowId: number;
  const startedAt = new Date();
  try {
    workflowId = createWorkflowRun(database, source, getSettings(database).mode);
    updateWorkflowRun(database, workflowId, {
      status: "running",
      stage: "生成 PAC",
      message: "正在读取配置并生成 PAC 文件",
      started_at: startedAt.toISOString(),
    });
  } catch (error) {
    active = false;
    throw error;
  }

  const promise = (async (): Promise<GenerateResult> => {
    try {
      const generation = await generatePac(database, dataDir);
      const finishedAt = new Date();
      updateWorkflowRun(database, workflowId, {
        status: generation.success ? "succeeded" : "failed",
        stage: generation.success ? "已完成" : "生成失败",
        message: generation.message,
        error: generation.success ? "" : generation.message,
        finished_at: finishedAt.toISOString(),
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      });
      return generation;
    } catch (error) {
      const finishedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
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
      throw error;
    } finally {
      active = false;
    }
  })();
  return { workflowId, promise };
}

/** Start a server-owned task and return its ID immediately; browser lifetime is irrelevant. */
export function startPacWorkflow(database: AppDatabase, dataDir: string, source: WorkflowSource): number {
  const started = beginPacWorkflow(database, dataDir, source);
  void started.promise.catch((error) => console.error("[workflow] task failed:", error));
  return started.workflowId;
}

/** Awaited variant used during startup and scheduled runs. */
export async function runPacWorkflow(
  database: AppDatabase,
  dataDir: string,
  source: WorkflowSource
): Promise<PacWorkflowResult> {
  const started = beginPacWorkflow(database, dataDir, source);
  const generation = await started.promise;
  return { workflowId: started.workflowId, generation };
}
