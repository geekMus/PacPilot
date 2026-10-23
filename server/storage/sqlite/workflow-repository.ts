import type { Database } from "bun:sqlite";
import type { WorkflowRepository } from "../repositories";
import {
  cancelPendingWorkflow,
  clearWorkflowHistory,
  claimWorkflowRun,
  countWorkflowRuns,
  createWorkflowRun,
  deleteWorkflowRun,
  finishWorkflowStage,
  getCurrentWorkflow,
  getWorkflowRun,
  listActiveWorkflowRuns,
  listWorkflowRuns,
  listWorkflowStages,
  markInterruptedWorkflows,
  startWorkflowStage,
  updateWorkflowRun,
} from "./workflows";
export function createSqliteWorkflowRepository(database: Database): WorkflowRepository {
  return {
    create: (source, mode) => createWorkflowRun(database, source, mode),
    claim: (id, startedAt) => claimWorkflowRun(database, id, startedAt),
    update: (id, patch) => updateWorkflowRun(database, id, patch),
    list: (limit = 50, beforeId = 0) => listWorkflowRuns(database, limit, beforeId),
    count: () => countWorkflowRuns(database),
    listActive: () => listActiveWorkflowRuns(database),
    current: () => getCurrentWorkflow(database),
    markInterrupted: () => markInterruptedWorkflows(database),
    startStage: (runId, stageKey, detail = "") => startWorkflowStage(database, runId, stageKey, detail),
    finishStage: (stageId, status, error = "", detail = "") =>
      finishWorkflowStage(database, stageId, status, error, detail),
    get: (id) => getWorkflowRun(database, id),
    stages: (runId) => listWorkflowStages(database, runId),
    cancelPending: (id) => cancelPendingWorkflow(database, id),
    clearHistory: () => clearWorkflowHistory(database),
    delete: (id) => deleteWorkflowRun(database, id),
  };
}
