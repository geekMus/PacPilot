import type { ApplicationStorage } from "../storage/repositories";
import { generatePac, type GenerateResult } from "./pac-generator";
import { t } from "../../shared/i18n";
import type { AppLocale } from "../../shared/i18n/locale";
import { runtimeLog } from "../utils/runtime-log";
import { publishDomainEvent } from "./notifications";

export type WorkflowSource = "startup" | "scheduled" | "manual" | "save-and-generate";
export interface PacWorkflowResult {
  workflowId: number;
  generation: GenerateResult;
}
interface QueueItem {
  workflowId: number;
  storage: ApplicationStorage;
  dataDir: string;
  locale: AppLocale;
  resolve: (result: GenerateResult) => void;
  reject: (error: unknown) => void;
  promise: Promise<GenerateResult>;
  execute: (item: QueueItem) => Promise<GenerateResult>;
}
const queues = new Map<string, QueueItem[]>();
const runningTypes = new Set<string>();
const PAC_WORKFLOW_TYPE = "pac-generation";
function encodeWorkflowStageDetail(value: unknown): string {
  const json = JSON.stringify(value ?? {});
  if (json === undefined) throw new Error("Workflow stage detail is not JSON-serializable.");
  return json.length > 32000
    ? JSON.stringify({ truncated: true, originalLength: json.length })
    : json;
}

const cancelledResult = (locale: AppLocale = "zh_CN"): GenerateResult => ({
  success: false,
  mode: "",
  message: t(locale, "serverErrors.workflowCancelled"),
  resultCode: "cancelled",
});

export async function hasActivePacWorkflow(storage: ApplicationStorage): Promise<boolean> {
  return (await storage.workflows.current()) !== null;
}

async function executePacWorkflow(item: QueueItem): Promise<GenerateResult> {
  const { storage, workflowId: id, locale } = item;
  const startedAt = new Date();
  let activeStageId: number | null = null;
  try {
    if (!(await storage.workflows.claim(id, startedAt.toISOString()))) {
      return cancelledResult(locale);
    }
    const settings = await storage.settings.get();
    await publishDomainEvent(
      storage,
      {
        type: "task.execution",
        phase: "started",
        subject: { type: "task", id: String(id), name: t(locale, "workflowMessages.taskName") },
        correlationId: "workflow-" + id,
        summary: t(locale, "workflowMessages.taskStarted"),
      },
      locale
    );
    const prepareDetail = encodeWorkflowStageDetail({
      mode: settings.mode,
      pac_proxy: settings.pacProxy,
      list_url: settings.listUrl || null,
      compressed: Boolean(settings.pacCompress || settings.pacObfuscate),
      obfuscated: Boolean(settings.pacObfuscate),
      timezone: settings.timezone,
      cron_schedule: settings.cronSchedule || null,
      block_list_count: settings.blockList.length,
      direct_list_count: settings.directList.length,
      data_dir: item.dataDir,
    });
    const prepareStage = await storage.workflows.startStage(id, "prepare", prepareDetail);
    activeStageId = prepareStage;
    await storage.workflows.finishStage(prepareStage, "succeeded", "", prepareDetail);
    activeStageId = null;

    const generationStage = await storage.workflows.startStage(id, "generate-pac");
    await storage.workflows.update(id, { stage: "generate-pac" });
    activeStageId = generationStage;
    const generation = await generatePac(storage, locale);
    const finishedAt = new Date();
    const generationDetail = encodeWorkflowStageDetail(generation.detail || {});
    await storage.workflows.finishStage(
      generationStage,
      generation.success ? "succeeded" : "failed",
      generation.success ? "" : generation.message,
      generationDetail
    );
    activeStageId = null;
    await storage.workflows.update(id, {
      status: generation.success ? "succeeded" : "failed",
      stage: generation.success ? "done" : "failed",
      error: generation.success ? "" : generation.message,
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    });
    await publishDomainEvent(
      storage,
      {
        type: "task.execution",
        phase: "finished",
        outcome: generation.success ? "success" : "failure",
        subject: { type: "task", id: String(id), name: t(locale, "workflowMessages.taskName") },
        correlationId: "workflow-" + id,
        summary: generation.message,
      },
      locale
    );
    return generation;
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    try {
      if (activeStageId !== null) {
        await storage.workflows.finishStage(
          activeStageId,
          "failed",
          message,
          encodeWorkflowStageDetail({ error: message })
        );
      }
      await storage.workflows.update(id, {
        status: "failed",
        stage: "exception",
        error: message,
        finished_at: finishedAt.toISOString(),
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      });
    } catch (recordError) {
      runtimeLog("error", "Failed to save workflow failure status: ", recordError);
    }
    await publishDomainEvent(
      storage,
      {
        type: "task.execution",
        phase: "finished",
        outcome: "failure",
        subject: { type: "task", id: String(id), name: t(locale, "workflowMessages.taskName") },
        correlationId: "workflow-" + id,
        summary: message,
      },
      locale
    );
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
        const run = await item.storage.workflows.get(item.workflowId);
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
async function enqueueWorkflow(
  type: string,
  storage: ApplicationStorage,
  dataDir: string,
  source: WorkflowSource,
  locale: AppLocale,
  execute: (item: QueueItem) => Promise<GenerateResult>
): Promise<QueueItem> {
  const workflowId = await storage.workflows.create(source, (await storage.settings.get()).mode);
  let resolve!: (result: GenerateResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<GenerateResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const item: QueueItem = { workflowId, storage, dataDir, locale, resolve, reject, promise, execute };
  const queue = queues.get(type) ?? [];
  queue.push(item);
  queues.set(type, queue);
  pumpQueue(type);
  return item;
}
async function enqueuePacWorkflow(
  storage: ApplicationStorage,
  dataDir: string,
  source: WorkflowSource,
  locale: AppLocale
): Promise<QueueItem> {
  return await enqueueWorkflow(PAC_WORKFLOW_TYPE, storage, dataDir, source, locale, executePacWorkflow);
}

/** Start a queued server-owned task and return its ID immediately. */
export async function startPacWorkflow(
  storage: ApplicationStorage,
  dataDir: string,
  source: WorkflowSource,
  locale: AppLocale = "zh_CN"
): Promise<number> {
  const item = await enqueuePacWorkflow(storage, dataDir, source, locale);
  void item.promise.catch((error) => runtimeLog("error", "Workflow execution failed: ", error));
  return item.workflowId;
}

/** Awaited variant used during startup and scheduled runs. */
export async function runPacWorkflow(
  storage: ApplicationStorage,
  dataDir: string,
  source: WorkflowSource,
  locale: AppLocale = "zh_CN"
): Promise<PacWorkflowResult> {
  const item = await enqueuePacWorkflow(storage, dataDir, source, locale);
  const generation = await item.promise;
  return { workflowId: item.workflowId, generation };
}
