/** Shared settings and webhook contracts used by the API server and browser client. */
export type GenerationMode = "custom" | "remote";
export type WebhookProvider = "custom" | "dingtalk";
export type WebhookMethod = "POST" | "PUT" | "PATCH";
export type DingTalkMessageType = "text" | "markdown";

export interface WebhookConfig {
  provider: WebhookProvider;
  url: string;
  method: WebhookMethod;
  headers: string;
  body: string;
  dingTalkSecret: string;
  dingTalkMessageType: DingTalkMessageType;
  testBody: string;
  messageTemplate: string;
  testMessageTemplate: string;
}

export interface AppSettings {
  mode: GenerationMode;
  pacProxy: string;
  pacCompress: boolean;
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  timezone: string;
  proxyTestUrl: string;
  logRetentionDays: number;
  webhookSuccessConfig: WebhookConfig;
  webhookFailureConfig: WebhookConfig;
}

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
