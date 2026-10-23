import type { AppSettings, GenerationMode, WorkflowRun, WorkflowStage } from "../../shared/contracts";
export interface AccessEventInput {
  created_at: string; method: string; path: string; category: string; source_ip: string;
  user_agent: string; status_code: number; duration_ms: number; response_bytes: number;
  query_string: string; host: string; referer: string; accept: string; accept_language: string;
  content_type: string; request_headers: string; response_content_type: string;
}
export interface AccessEvent extends AccessEventInput { id: number; }
export interface MonitorSummary {
  generatedAt: string; activeRequests: number; tcpConnections: number; requestsLastHour: number;
  requestsLast24h: number; uniqueSourcesLast24h: number; errorRequestsLast24h: number;
  serverErrorsLast24h: number; averageResponseMs: number; p95ResponseMs: number; errorRate: number;
  requestTrend: Array<{ hour: string; requests: number; errors: number }>;
  pacRequestsLastHour: number; pacRequestsLast24h: number; pacSuccessRate: number;
  pacFailureRequestsLast24h: number; pacAverageResponseMs: number;
  latestPacRequest: { created_at: string; source_ip: string; status_code: number; duration_ms: number } | null;
  pacRequestTrend: Array<{ hour: string; requests: number; errors: number; averageResponseMs: number }>;
}

export interface Page<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor: number | null;
}

export interface SettingsRepository {
  get(): AppSettings;
  set(settings: AppSettings): void;
  update(patch: Partial<AppSettings>): AppSettings;
}

export interface AdminCredentialRecord {
  passwordHash: string;
  salt: string;
  sessionSecret: string;
}

export interface AdminCredentialRepository {
  get(): AdminCredentialRecord | null;
  set(record: AdminCredentialRecord): void;
}

export interface GenerationLog {
  id: number;
  success: boolean;
  mode: string;
  result_code: string;
  detail: Record<string, string | number | boolean>;
  error: string;
  created_at: string;
}

export interface GenerationLogRepository {
  append(success: boolean, mode: GenerationMode, resultCode: string, detail?: Record<string, string | number | boolean>, error?: string): void;
  list(limit?: number, offset?: number, beforeId?: number): GenerationLog[];
  count(): number;
  storageBytes(): number;
  cleanup(retentionDays?: number): number;
  clear(): number;
}

export interface MonitoringRepository {
  record(event: AccessEventInput): void;
  list(limit?: number, beforeId?: number): AccessEvent[];
  count(): number;
  storageBytes(): number;
  summarize(activeRequests: number, tcpConnections: number): MonitorSummary;
  cleanup(retentionDays?: number): number;
  clear(): number;
}

export interface WorkflowRepository {
  create(source: string, mode: string): number;
  claim(id: number, startedAt: string): boolean;
  update(id: number, patch: Partial<Pick<WorkflowRun, "status" | "stage" | "mode" | "error" | "started_at" | "finished_at" | "duration_ms">>): void;
  list(limit?: number, beforeId?: number): WorkflowRun[];
  count(): number;
  listActive(): WorkflowRun[];
  current(): WorkflowRun | null;
  markInterrupted(): void;
  startStage(runId: number, stageKey: string, detail?: string): number;
  finishStage(stageId: number, status: "succeeded" | "failed" | "skipped", error?: string, detail?: string): void;
  get(id: number): WorkflowRun | null;
  stages(runId: number): WorkflowStage[];
  cancelPending(id: number): "cancelled" | "not-found" | "not-pending";
  clearHistory(): { deletedRuns: number; activeRuns: number };
  delete(id: number): "deleted" | "not-found" | "active";
}

export interface ArtifactRepository {
  read(key: string): Uint8Array | undefined;
  write(key: string, contents: Uint8Array | string): void;
  delete(key: string): boolean;
  exists(key: string): boolean;
  stat(key: string): { size: number; modifiedAt: string } | undefined;
  list(prefix?: string): string[];
  totalBytes(): number;
}

export interface StorageMaintenance {
  databaseBytes(): number;
  compact(): void;
  checkpoint(): void;
  resetOperationalData(settings: AppSettings): void;
}

export interface ApplicationStorage {
  readonly driver: "sqlite" | "memory";
  readonly settings: SettingsRepository;
  readonly credentials: AdminCredentialRepository;
  readonly generationLogs: GenerationLogRepository;
  readonly monitoring: MonitoringRepository;
  readonly workflows: WorkflowRepository;
  readonly artifacts: ArtifactRepository;
  readonly maintenance: StorageMaintenance;
  close(): void;
}
