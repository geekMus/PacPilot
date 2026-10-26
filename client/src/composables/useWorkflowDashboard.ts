import { useI18n } from "vue-i18n";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type WorkflowRun } from "@/api/client";
import { useToast } from "@/composables/useToast";
import { useWorkflowLabels } from "@/composables/useWorkflowLabels";
import { fetchAdminSession } from "@/composables/useAdminSession";

export function useWorkflowDashboard() {
  const { t } = useI18n();
  const { statusLabel, stageLabel, sourceLabel, modeLabel, durationLabel, dateLabel } =
    useWorkflowLabels();

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
  const confirmingCurrentCancel = ref(false);
  const confirmingQueueCancelId = ref<number | null>(null);
  const confirmingHistoryCancelId = ref<number | null>(null);
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
          // 标签页在后台时不轮询，避免无意义的持续请求；回到前台立刻补一次。
          if (document.hidden) return;
          if (isActiveRun(current.value)) void load(true);
          else stopPolling();
        }, 3000);
    } else stopPolling();
  }
  function stopPolling() {
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = undefined;
  }
  // 从后台切回前台时立刻补一次刷新，避免用户看到过期状态。
  function onVisibilityChange() {
    if (!document.hidden && isActiveRun(current.value)) void load(true);
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

  async function load(silent = false, resetHistory = false) {
    if (requestInFlight) return;
    requestInFlight = true;
    if (!silent) refreshing.value = true;
    error.value = "";
    try {
      // 优先复用路由守卫刚做过的会话探测；缓存过期时仍会重新校验。
      const session = await fetchAdminSession();
      // 路由守卫只在导航时校验；会话在停留期间失效时这里必须自己回登录页，
      // 并带上当前地址，登录后才能回到这一页。
      if (!session.loggedIn) {
        await router.replace({
          name: "login",
          query: { redirect: router.currentRoute.value.fullPath },
        });
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
              run.status === "succeeded"
                ? "success"
                : run.status === "failed"
                  ? "error"
                  : "warning",
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
      activeRuns.value = result.active ?? [];
      if (resetHistory || runs.value.length === 0) {
        runs.value = result.runs;
        historyHasMore.value = result.hasMore;
      } else {
        const merged = new Map<number, WorkflowRun>();
        for (const run of [...result.runs, ...runs.value]) merged.set(run.id, run);
        runs.value = [...merged.values()].sort((a, b) => b.id - a.id);
        historyHasMore.value = runs.value.length < result.total;
      }
      historyTotal.value = result.total;
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
      historyTotal.value = result.total;
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
    document.addEventListener("visibilitychange", onVisibilityChange);
    void load();
  });
  onUnmounted(() => {
    stopPolling();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return {
    t,
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
    confirmingCurrentCancel,
    confirmingQueueCancelId,
    confirmingHistoryCancelId,
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
    cancelRun,
  };
}
