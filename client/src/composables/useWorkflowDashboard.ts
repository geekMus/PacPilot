import { useI18n } from "vue-i18n";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type WorkflowRun } from "../api/client";
import { useToast } from "./useToast";

export function useWorkflowDashboard() {

const { t, locale } = useI18n();

const router = useRouter();
const { notify } = useToast();
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const current = ref<WorkflowRun | null>(null);
const activeRuns = ref<WorkflowRun[]>([]);
const runs = ref<WorkflowRun[]>([]);
const historyPageSize = 50;
const historyHasMore = ref(false);
const historyLoadingMore = ref(false);
const historyLoadError = ref("");
const historyTotal = ref(0);
const selectedStatus = ref("all");
const selectedSource = ref("all");
const deletingId = ref<number | null>(null);
const confirmingHistoryDeleteId = ref<number | null>(null);
const confirmingCurrentCancel = ref(false);
const confirmingQueueCancelId = ref<number | null>(null);
const confirmingHistoryCancelId = ref<number | null>(null);
const confirmingHistoryClear = ref(false);
const clearingHistory = ref(false);
const cancellingId = ref<number | null>(null);
let previousStatuses = new Map<number, string>();
let statusSnapshotReady = false;
let pollHandle: ReturnType<typeof setInterval> | undefined;
let requestInFlight = false;
const isActiveRun = (run: WorkflowRun | null | undefined) =>
  Boolean(run && (run.status === "pending" || run.status === "running"));
function syncPolling(run: WorkflowRun | null) {
  if (isActiveRun(run)) {
    if (!pollHandle)
      pollHandle = setInterval(() => {
        if (isActiveRun(current.value)) void load(true);
        else stopPolling();
      }, 3000);
  } else stopPolling();
}
function stopPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = undefined;
}

const active = computed(() => Boolean(current.value));
const otherActiveRuns = computed(() =>
  activeRuns.value.filter((run) => run.id !== current.value?.id)
);
const filteredRuns = computed(() =>
  runs.value.filter(
    (run) =>
      (selectedStatus.value === "all" || run.status === selectedStatus.value) &&
      (selectedSource.value === "all" || run.source === selectedSource.value)
  )
);
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
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return t("workflowPage.sec", { n: (ms / 1000).toFixed(1) });
  return t("workflowPage.minSec", {
    m: Math.floor(ms / 60000),
    s: Math.floor((ms % 60000) / 1000),
  });
};
const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN") : "—";

async function load(silent = false, resetHistory = false) {
  if (requestInFlight) return;
  requestInFlight = true;
  if (!silent) refreshing.value = true;
  error.value = "";
  try {
    const session = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    const result = await api.workflows(historyPageSize, 0);
    if (statusSnapshotReady) {
      for (const run of result.runs) {
        const previous = previousStatuses.get(run.id);
        if (
          (previous === "running" || previous === "pending") &&
          ["succeeded", "failed", "cancelled"].includes(run.status)
        ) {
          const message =
            run.status === "succeeded"
              ? t("workflowPage.runCompleted", { id: run.id })
              : run.status === "failed"
                ? t("workflowPage.runFailed", {
                    id: run.id,
                    detail: run.error || t("workflowPage.k11"),
                  })
                : t("workflowPage.runCancelled", { id: run.id });
          notify(
            message,
            run.status === "succeeded" ? "success" : run.status === "failed" ? "error" : "warning",
            6500
          );
        }
      }
    }
    previousStatuses = new Map([
      ...previousStatuses,
      ...result.runs.map((run) => [run.id, run.status] as [number, string]),
    ]);
    statusSnapshotReady = true;
    current.value = result.current;
    activeRuns.value = result.active ?? (result.current ? [result.current] : []);
    if (resetHistory || runs.value.length === 0) {
      runs.value = result.runs;
      historyHasMore.value = result.hasMore ?? false;
    } else {
      const merged = new Map<number, WorkflowRun>();
      for (const run of [...result.runs, ...runs.value]) merged.set(run.id, run);
      runs.value = [...merged.values()].sort((a, b) => b.id - a.id);
      historyHasMore.value = runs.value.length < (result.total ?? runs.value.length);
    }
    historyTotal.value = result.total ?? runs.value.length;
    historyLoadError.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    if (!silent) notify(error.value, "error");
  } finally {
    loading.value = false;
    refreshing.value = false;
    requestInFlight = false;
    syncPolling(current.value);
  }
}

async function loadMoreHistory(): Promise<void> {
  if (historyLoadingMore.value || !historyHasMore.value || !runs.value.length) return;
  historyLoadingMore.value = true;
  historyLoadError.value = "";
  try {
    const cursor = runs.value[runs.value.length - 1]?.id ?? 0;
    const result = await api.workflows(historyPageSize, cursor);
    const seen = new Set(runs.value.map((run) => run.id));
    runs.value.push(...result.runs.filter((run) => !seen.has(run.id)));
    runs.value.sort((a, b) => b.id - a.id);
    historyTotal.value = result.total ?? historyTotal.value;
    historyHasMore.value = runs.value.length < historyTotal.value;
  } catch (caught) {
    historyLoadError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    historyLoadingMore.value = false;
  }
}

function resetConfirmations() {
  confirmingCurrentCancel.value = false;
  confirmingQueueCancelId.value = null;
  confirmingHistoryCancelId.value = null;
  confirmingHistoryDeleteId.value = null;
  confirmingHistoryClear.value = false;
}
function toggleCurrentCancel(toggle: () => void, isOpen: boolean) {
  if (!isOpen) resetConfirmations();
  toggle();
}
function toggleQueueCancel(toggle: () => void, isOpen: boolean) {
  if (!isOpen) resetConfirmations();
  toggle();
}
function toggleHistoryCancel(toggle: () => void, isOpen: boolean) {
  if (!isOpen) resetConfirmations();
  toggle();
}
function toggleHistoryDelete(toggle: () => void, isOpen: boolean) {
  if (!isOpen) resetConfirmations();
  toggle();
}
function toggleHistoryClear(toggle: () => void, isOpen: boolean) {
  // Closing keeps the component's normal behavior; opening first closes any
  // per-row confirmation that might otherwise remain visible beside this one.
  if (!isOpen) resetConfirmations();
  toggle();
}
const historyClearDisabledReason = computed(() => {
  if (loading.value) return t("workflowPage.k12");
  if (clearingHistory.value) return t("workflowPage.k13");
  if (activeRuns.value.length > 0) return t("workflowPage.k14");
  if (runs.value.length === 0) return t("workflowPage.k15");
  if (deletingId.value !== null) return t("workflowPage.k16");
  if (cancellingId.value !== null) return t("workflowPage.k17");
  return "";
});

async function clearWorkflowHistory() {
  if (
    clearingHistory.value ||
    activeRuns.value.length > 0 ||
    runs.value.length === 0 ||
    deletingId.value !== null ||
    cancellingId.value !== null
  )
    return;
  clearingHistory.value = true;
  try {
    const result = await api.clearWorkflowHistory();
    resetConfirmations();
    runs.value = [];
    current.value = null;
    activeRuns.value = [];
    previousStatuses = new Map<number, string>();
    statusSnapshotReady = true;
    historyHasMore.value = false;
    historyLoadError.value = "";
    historyTotal.value = 0;
    selectedStatus.value = "all";
    selectedSource.value = "all";
    notify(t("workflowPage.clearedRuns", { n: result.deletedRuns }), "success");
  } catch (caught) {
    notify(caught instanceof Error ? caught.message : String(caught), "error");
  } finally {
    clearingHistory.value = false;
  }
}
async function deleteRun(run: WorkflowRun) {
  if (deletingId.value !== null || confirmingHistoryDeleteId.value !== run.id) return;
  if (run.status === "running" || run.status === "pending") {
    notify(t("workflowPage.k19"), "warning");
    return;
  }
  deletingId.value = run.id;
  try {
    await api.deleteWorkflow(run.id);
    runs.value = runs.value.filter((item) => item.id !== run.id);
    previousStatuses.delete(run.id);
    confirmingHistoryDeleteId.value = null;
    notify(t("workflowPage.deletedRun", { id: run.id }), "success");
    historyTotal.value = Math.max(0, historyTotal.value - 1);
    historyHasMore.value = runs.value.length < historyTotal.value;
    if (current.value?.id === run.id) current.value = null;
  } catch (caught) {
    notify(caught instanceof Error ? caught.message : String(caught), "error");
  } finally {
    deletingId.value = null;
  }
}
async function cancelRun(run: WorkflowRun, source: "current" | "queue" | "history") {
  const confirmationOpen =
    source === "current"
      ? confirmingCurrentCancel.value && current.value?.id === run.id
      : source === "queue"
        ? confirmingQueueCancelId.value === run.id
        : confirmingHistoryCancelId.value === run.id;
  if (run.status !== "pending" || cancellingId.value !== null || !confirmationOpen) return;
  cancellingId.value = run.id;
  try {
    await api.cancelWorkflow(run.id);
    resetConfirmations();
    await load(true);
  } catch (caught) {
    notify(caught instanceof Error ? caught.message : String(caught), "error");
  } finally {
    cancellingId.value = null;
  }
}
onMounted(() => {
  void load();
});
onUnmounted(stopPolling);

return {
  t,
  locale,
  router,
  loading,
  refreshing,
  error,
  current,
  activeRuns,
  runs,
  historyHasMore,
  historyLoadingMore,
  historyLoadError,
  historyTotal,
  selectedStatus,
  selectedSource,
  deletingId,
  confirmingHistoryDeleteId,
  confirmingCurrentCancel,
  confirmingQueueCancelId,
  confirmingHistoryCancelId,
  confirmingHistoryClear,
  clearingHistory,
  cancellingId,
  active,
  otherActiveRuns,
  filteredRuns,
  statusLabel,
  stageLabel,
  sourceLabel,
  modeLabel,
  durationLabel,
  dateLabel,
  load,
  loadMoreHistory,
  resetConfirmations,
  toggleCurrentCancel,
  toggleQueueCancel,
  toggleHistoryCancel,
  toggleHistoryDelete,
  toggleHistoryClear,
  historyClearDisabledReason,
  clearWorkflowHistory,
  deleteRun,
  cancelRun,
};

}
