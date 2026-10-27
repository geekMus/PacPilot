/** Shared settings and webhook contracts used by the API server and browser client. */
export type GenerationMode = "custom" | "remote";
export type WebhookProvider = "custom" | "dingtalk";
export type WebhookMethod = "POST" | "PUT" | "PATCH";
export type DingTalkMessageType = "text" | "markdown";

/** GFWList 官方发布地址，作为远程规则列表的默认值。 */
export const DEFAULT_LIST_URL =
  "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt";

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
  pacObfuscate: boolean;
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  timezone: string;
  logRetentionDays: number;
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

export type NotificationEventType =
  "task.execution" | "config.publish" | "request.process" | "system.error";
export type NotificationEventPhase = "started" | "progress" | "finished" | "state_changed";
export type NotificationOutcome = "success" | "failure" | "cancelled" | "timeout" | "unknown";
export interface DomainEvent {
  id: string;
  type: NotificationEventType;
  phase: NotificationEventPhase;
  outcome?: NotificationOutcome;
  subject: { type: string; id: string; name?: string };
  occurredAt: string;
  correlationId: string;
  summary?: string;
  details?: Record<string, unknown>;
}
export interface NotificationChannel {
  id: string;
  name: string;
  provider: WebhookProvider;
  enabled: boolean;
  config: WebhookConfig;
  hasSecret?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  eventType: NotificationEventType;
  phase: NotificationEventPhase;
  outcome: NotificationOutcome | "any" | null;
  channelIds: string[];
  subjectType?: string;
  createdAt: string;
  updatedAt: string;
}
export type NotificationDeliveryStatus = "pending" | "sending" | "succeeded" | "failed";
export interface NotificationDelivery {
  id: string;
  eventId: string;
  ruleId: string;
  channelId: string;
  status: NotificationDeliveryStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  lastError?: string;
}
export interface NotificationDocument {
  channels: NotificationChannel[];
  rules: NotificationRule[];
  events: DomainEvent[];
  deliveries: NotificationDelivery[];
}
export interface NotificationEventDefinition {
  type: NotificationEventType;
  phases: NotificationEventPhase[];
  outcomes: NotificationOutcome[];
  subjectTypes: string[];
}
