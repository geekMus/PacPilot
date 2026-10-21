import type { AppDatabase } from "../db/sqlite";
import {
  createWorkflowRun,
  claimWorkflowRun,
  getCurrentWorkflow,
  getSettings,
  getWorkflowRun,
  updateWorkflowRun,
  startWorkflowStage,
  finishWorkflowStage,
  encodeWorkflowStageDetail,
} from "../db/sqlite";
import { generatePac, type GenerateResult } from "./pac-generator";
import { t } from "../../shared/i18n";
import { runtimeLog } from "../utils/runtime-log";

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
  execute: (item: QueueItem) => Promise<GenerateResult>;
}
const queues = new Map<string, QueueItem[]>();
const runningTypes = new Set<string>();
const PAC_WORKFLOW_TYPE = "pac-generation";
const cancelledResult = (): GenerateResult => ({
  success: false,
  mode: "",
  message: t("zh_CN", "serverErrors.workflowCancelled"),
  resultCode: "cancelled",
  pacPath: "",
});

export function hasActivePacWorkflow(database: AppDatabase): boolean {
  return getCurrentWorkflow(database) !== null;
}

async function executePacWorkflow(item: QueueItem): Promise<GenerateResult> {
  const { database, workflowId: id } = item;
  const startedAt = new Date();
  let activeStageId: number | null = null;
  try {
    if (!claimWorkflowRun(database, id, startedAt.toISOString())) {
      return cancelledResult();
    }
    const settings = getSettings(database);
    const prepareDetail = encodeWorkflowStageDetail({
      mode: settings.mode,
      pac_proxy: settings.pacProxy,
      list_url: settings.listUrl || null,
      compressed: Boolean(settings.pacCompress),
      timezone: settings.timezone,
      cron_schedule: settings.cronSchedule || null,
      block_list_count: settings.blockList.length,
      direct_list_count: settings.directList.length,
      webhook_success_configured: Boolean(settings.webhookSuccessConfig?.url?.trim()),
      webhook_failure_configured: Boolean(settings.webhookFailureConfig?.url?.trim()),
      data_dir: item.dataDir,
    });
    const prepareStage = startWorkflowStage(database, id, "prepare", prepareDetail);
    activeStageId = prepareStage;
    finishWorkflowStage(database, prepareStage, "succeeded", "", prepareDetail);
    activeStageId = null;

    const generationStage = startWorkflowStage(database, id, "generate-pac");
    updateWorkflowRun(database, id, { stage: "generate-pac" });
    activeStageId = generationStage;
    const generation = await generatePac(database, item.dataDir);
    const finishedAt = new Date();
    const generationDetail = encodeWorkflowStageDetail(generation.detail || {});
    finishWorkflowStage(
      database,
      generationStage,
      generation.success ? "succeeded" : "failed",
      generation.success ? "" : generation.message,
      generationDetail
    );
    activeStageId = null;
    updateWorkflowRun(database, id, {
      status: generation.success ? "succeeded" : "failed",
      stage: generation.success ? "done" : "failed",
      error: generation.success ? "" : generation.message,
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    });
    return generation;
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    try {
      if (activeStageId !== null) {
        finishWorkflowStage(
          database,
          activeStageId,
          "failed",
          message,
          encodeWorkflowStageDetail({ error: message })
        );
      }
      updateWorkflowRun(database, id, {
        status: "failed",
        stage: "exception",
        error: message,
        finished_at: finishedAt.toISOString(),
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      });
    } catch (recordError) {
      runtimeLog("error", "保存工作流失败状态时发生错误：", recordError);
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
        const run = getWorkflowRun(item.database, item.workflowId);
        if (!run || run.status !== "pending") {
          item.resolve(cancelledResult());
          continue;
        }
        try {
          item.resolve(await item.execute(item));
        } catch (error) {
          item.reject(error);
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
  const promise = new Promise<GenerateResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const item: QueueItem = { workflowId, database, dataDir, resolve, reject, promise, execute };
  const queue = queues.get(type) ?? [];
  queue.push(item);
  queues.set(type, queue);
  pumpQueue(type);
  return item;
}
function enqueuePacWorkflow(
  database: AppDatabase,
  dataDir: string,
  source: WorkflowSource
): QueueItem {
  return enqueueWorkflow(PAC_WORKFLOW_TYPE, database, dataDir, source, executePacWorkflow);
}

/** Start a queued server-owned task and return its ID immediately. */
export function startPacWorkflow(
  database: AppDatabase,
  dataDir: string,
  source: WorkflowSource
): number {
  const item = enqueuePacWorkflow(database, dataDir, source);
  void item.promise.catch((error) => runtimeLog("error", "工作流执行失败：", error));
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
