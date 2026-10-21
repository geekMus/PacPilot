/** Shared API contracts for workflow history, used by both the server and browser client. */
export type WorkflowStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface WorkflowRun {
  id: number;
  source: string;
  status: WorkflowStatus;
  stage: string;
  mode: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface WorkflowStage {
  id: number;
  run_id: number;
  stage_key: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  error: string;
  /** JSON-encoded diagnostics. */
  detail: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
}
