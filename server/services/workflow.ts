import type { AppDatabase } from "../db/sqlite";
import {
  createWorkflowRun,
  getCurrentWorkflow,
  getSettings,
  getWorkflowRun,
  updateWorkflowRun,
  startWorkflowStage,
  finishWorkflowStage,
} from "../db/sqlite";
import { generatePac, type GenerateResult } from "./pac-generator";

export type WorkflowSource = "startup" | "scheduled" | "manual" | "save-and-generate";
export interface PacWorkflowResult {
  workflowId: number;
  generation: GenerateResult;
}
interface QueueItem {
  workflowId: number;
  database: AppDatabase;
  dataDir: string;
  resolve: (result: GenerateResult) => void;
  reject: (error: unknown) => void;
  promise: Promise<GenerateResult>;
  controller: AbortController;
  execute: (item: QueueItem) => Promise<GenerateResult>;
}
const queues = new Map<string, QueueItem[]>();
const runningTypes = new Set<string>();
const activeItems = new Map<string, QueueItem>();
const PAC_WORKFLOW_TYPE = "pac-generation";
const cancelledResult = (): GenerateResult => ({
  success: false,
  mode: "",
  message: "任务已被更新的工作流取消",
  pacPath: "",
});

function cancelItem(item: QueueItem, reason: string): void {
  item.controller.abort(reason);
  const finishedAt = new Date().toISOString();
  updateWorkflowRun(item.database, item.workflowId, {
    status: "cancelled",
    stage: "已被新任务替代",
    message: reason,
    error: "",
    finished_at: finishedAt,
    duration_ms: null,
  });
}

export function hasActivePacWorkflow(database: AppDatabase): boolean {
  return getCurrentWorkflow(database) !== null;
}

async function executePacWorkflow(item: QueueItem): Promise<GenerateResult> {
  const { database, workflowId: id } = item;
  const startedAt = new Date();
  let activeStageId: number | null = null;
  try {
    updateWorkflowRun(database, id, {
      status: "running",
      stage: "生成 PAC",
      message: "正在读取配置并生成 PAC 文件",
      started_at: startedAt.toISOString(),
    });
    const prepareStage = startWorkflowStage(database, id, "prepare", "准备工作流", "已读取当前配置并完成任务初始化");
    activeStageId = prepareStage;
    finishWorkflowStage(database, prepareStage, "succeeded", "工作流初始化成功");
    activeStageId = null;

    const generationStage = startWorkflowStage(database, id, "generate-pac", "生成 PAC", "正在根据当前配置生成并写入 PAC 文件");
    activeStageId = generationStage;
    const generation = await generatePac(database, item.dataDir, item.controller.signal);
    if (item.controller.signal.aborted) {
      finishWorkflowStage(database, generationStage, "skipped", "任务已被更新的工作流取消");
      activeStageId = null;
      return cancelledResult();
    }
    const finishedAt = new Date();
    finishWorkflowStage(database, generationStage, generation.success ? "succeeded" : "failed", generation.message, generation.success ? "" : generation.message);
    activeStageId = null;
    updateWorkflowRun(database, id, {
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
      if (item.controller.signal.aborted) {
        if (activeStageId !== null) finishWorkflowStage(database, activeStageId, "skipped", "任务已被更新的工作流取消");
        updateWorkflowRun(database, id, { status: "cancelled", stage: "已被新任务替代", message: "任务已被更新的工作流取消", error: "", finished_at: finishedAt.toISOString(), duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()) });
        return cancelledResult();
      }
      if (activeStageId !== null) finishWorkflowStage(database, activeStageId, "failed", "工作流阶段发生异常", message);
      updateWorkflowRun(database, id, {
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
  }
}
function pumpQueue(type: string): void {
  if (runningTypes.has(type)) return;
  runningTypes.add(type);
  void (async () => {
    const queue = queues.get(type);
    try {
      while (queue?.length) {
        const item = queue.shift()!;
        activeItems.set(type, item);
        const run = getWorkflowRun(item.database, item.workflowId);
        if (!run || run.status !== "pending" || item.controller.signal.aborted) {
          item.resolve(cancelledResult());
          activeItems.delete(type);
          continue;
        }
        try {
          item.resolve(await item.execute(item));
        } catch (error) {
          item.reject(error);
        } finally {
          if (activeItems.get(type) === item) activeItems.delete(type);
        }
      }
    } finally {
      runningTypes.delete(type);
      if (queues.get(type)?.length) pumpQueue(type);
      else queues.delete(type);
    }
  })();
}

/** Each workflow type owns an independent serial queue; different types can run concurrently. */
function enqueueWorkflow(
  type: string,
  database: AppDatabase,
  dataDir: string,
  source: WorkflowSource,
  execute: (item: QueueItem) => Promise<GenerateResult>
): QueueItem {
  const workflowId = createWorkflowRun(database, source, getSettings(database).mode);
  let resolve!: (result: GenerateResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<GenerateResult>((res, rej) => { resolve = res; reject = rej; });
  const item: QueueItem = { workflowId, database, dataDir, resolve, reject, promise, controller: new AbortController(), execute };
  const previous = activeItems.get(type);
  if (previous) cancelItem(previous, "已有更新的工作流启动，当前任务已取消");
  const queue = queues.get(type) ?? [];
  for (const waiting of queue.splice(0)) {
    cancelItem(waiting, "已有更新的工作流启动，等待任务已取消");
    waiting.resolve(cancelledResult());
  }
  queue.push(item);
  queues.set(type, queue);
  pumpQueue(type);
  return item;
}
function enqueuePacWorkflow(database: AppDatabase, dataDir: string, source: WorkflowSource): QueueItem {
  return enqueueWorkflow(PAC_WORKFLOW_TYPE, database, dataDir, source, executePacWorkflow);
}

/** Start a queued server-owned task and return its ID immediately. */
export function startPacWorkflow(database: AppDatabase, dataDir: string, source: WorkflowSource): number {
  const item = enqueuePacWorkflow(database, dataDir, source);
  void item.promise.catch((error) => console.error("[workflow] task failed:", error));
  return item.workflowId;
}

/** Awaited variant used during startup and scheduled runs. */
export async function runPacWorkflow(
  database: AppDatabase,
  dataDir: string,
  source: WorkflowSource
): Promise<PacWorkflowResult> {
  const item = enqueuePacWorkflow(database, dataDir, source);
  const generation = await item.promise;
  return { workflowId: item.workflowId, generation };
}
