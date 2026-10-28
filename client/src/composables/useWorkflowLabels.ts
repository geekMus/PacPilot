import { useI18n } from "vue-i18n";
import type { WorkflowRun } from "@/api/client";

/**
 * Shared workflow label helpers. Presentation-only utilities extracted from
 * useWorkflowDashboard so pages like the admin overview can reuse the same
 * wording without pulling in the polling/queue state machine.
 */
export function useWorkflowLabels() {
  const { t, locale } = useI18n();

  const statusNames: Record<string, string> = {
    pending: "workflowPage.k0",
    running: "workflowPage.k1",
    succeeded: "workflowPage.k2",
    failed: "workflowPage.k3",
    cancelled: "workflowPage.k4",
  };
  const sourceNames: Record<string, string> = {
    startup: "workflowPage.k5",
    scheduled: "workflowPage.k6",
    manual: "workflowPage.k7",
    "save-and-generate": "workflowPage.k8",
  };
  const statusLabel = (status: string) => (statusNames[status] ? t(statusNames[status]) : status);
  const stageLabel = (stage: string) => t(`workflow.stageNames.${stage}`);
  const sourceLabel = (source: string) => (sourceNames[source] ? t(sourceNames[source]) : source);
  const modeLabel = (mode: string) =>
    mode === "remote"
      ? t("workflowPage.k9")
      : mode === "custom"
        ? t("workflowPage.k10")
        : mode || "—";
  const durationLabel = (run: WorkflowRun) => {
    const ms =
      run.duration_ms ?? (run.started_at ? Date.now() - new Date(run.started_at).getTime() : null);
    if (ms === null || !Number.isFinite(ms)) return "—";
    if (ms < 1000) return ms + " ms";
    if (ms < 60000) return t("workflowPage.sec", { n: (ms / 1000).toFixed(1) });
    return t("workflowPage.minSec", {
      m: Math.floor(ms / 60000),
      s: Math.floor((ms % 60000) / 1000),
    });
  };
  const dateLabel = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN") : "—";

  return { statusLabel, stageLabel, sourceLabel, modeLabel, durationLabel, dateLabel };
}
