<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type WorkflowDetail, type WorkflowStage } from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import { useToast } from "../composables/useToast";


const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const { notify } = useToast();

const detail = ref<WorkflowDetail | null>(null);
const loading = ref(true);
const error = ref("");
const deleting = ref(false);
const confirmingDelete = ref(false);
const cancelling = ref(false);
const confirmingCancel = ref(false);

let previousStatus: string | null = null;
let pollHandle: ReturnType<typeof setInterval> | undefined;
let requestInFlight = false;

const selectedStage = ref<WorkflowStage | null>(null);
const stageDetailDialog = ref<HTMLDialogElement | null>(null);
const stageDetailCopyState = ref("");

const statuses: Record<string, string> = {
  pending: t("workflowDetailPage.k0"),
  running: t("workflowDetailPage.k1"),
  succeeded: t("workflowDetailPage.k2"),
  failed: t("workflowDetailPage.k3"),
  cancelled: t("workflowDetailPage.k4"),
  skipped: t("workflowDetailPage.k5"),
};
const sources: Record<string, string> = {
  startup: t("workflowDetailPage.k6"),
  scheduled: t("workflowDetailPage.k7"),
  manual: t("workflowDetailPage.k8"),
  "save-and-generate": t("workflowDetailPage.k9"),
};

const isActiveStatus = (status: string | undefined) => status === "pending" || status === "running";

const label = (v: string) => statuses[v] || v;
const sourceLabel = (v: string) => sources[v] || v;
const dateLabel = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

function stopPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = undefined;
}

function syncPolling() {
  if (isActiveStatus(detail.value?.run.status)) {
    if (!pollHandle) {
      pollHandle = setInterval(() => {
        if (isActiveStatus(detail.value?.run.status)) void load();
        else stopPolling();
      }, 3000);
    }
  } else {
    stopPolling();
  }
}

function formatStageDetail(raw: string | undefined | null): string {
  if (!raw || !String(raw).trim()) return t("workflowDetailPage.k10");
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return String(raw);
  }
}

async function openStageDetail(stage: WorkflowStage): Promise<void> {
  selectedStage.value = stage;
  stageDetailCopyState.value = "";
  await nextTick();
  if (stageDetailDialog.value && !stageDetailDialog.value.open) {
    stageDetailDialog.value.showModal();
  }
}

function closeStageDetail(): void {
  if (stageDetailDialog.value?.open) stageDetailDialog.value.close();
}

function onStageDetailClose(): void {
  selectedStage.value = null;
  stageDetailCopyState.value = "";
}

function handleStageDetailBackdrop(event: MouseEvent): void {
  if (event.target === stageDetailDialog.value) closeStageDetail();
}

async function copyStageDetail(): Promise<void> {
  const stage = selectedStage.value;
  if (!stage) return;
  const text = [
    t("workflowDetailPage.stageName", { name: stage.name }),
    t("workflowDetailPage.stageKey", { key: stage.stage_key }),
    `${t("workflowDetailPage.k33")}：${label(stage.status)}`,
    t("workflowDetailPage.stageMsg", { msg: stage.message || "—" }),
    t("workflowDetailPage.stageErr", { err: stage.error || "—" }),
    t("workflowDetailPage.stageStart", { time: dateLabel(stage.started_at) }),
    t("workflowDetailPage.stageEnd", { time: dateLabel(stage.finished_at) }),
    `${t("workflowDetailPage.k34")}：${stage.duration_ms == null ? "—" : stage.duration_ms + " ms"}`,
    "",
    t("workflowDetailPage.k11"),
    formatStageDetail(stage.detail),
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    stageDetailCopyState.value = t("workflowDetailPage.k12");
  } catch {
    stageDetailCopyState.value = t("workflowDetailPage.k13");
  }
}

function durationLabel(s: WorkflowStage) {
  const ms = s.duration_ms ?? (s.started_at ? Date.now() - new Date(s.started_at).getTime() : null);
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return t("workflowDetailPage.sec", { n: (ms / 1000).toFixed(1) });
  return t("workflowDetailPage.minSec", { m: Math.floor(ms / 60000), s: Math.floor((ms % 60000) / 1000) });
}

function stageIconName(status: string): string {
  if (status === "succeeded") return "circle-check";
  if (status === "failed") return "circle-x";
  if (status === "running") return "loader-circle";
  if (status === "pending") return "clock";
  if (status === "skipped") return "circle";
  return "circle-help";
}

async function load() {
  if (requestInFlight) return;
  requestInFlight = true;
  const requestedId = Number(route.params.id);
  try {
    const session = await api.session();
    if (!session.loggedIn) {
      stopPolling();
      await router.replace("/admin/login");
      return;
    }
    if (session.mustChangePassword) {
      stopPolling();
      await router.replace("/admin/settings");
      return;
    }
    const next = await api.workflowDetail(requestedId);
    if (requestedId !== Number(route.params.id)) return;
    if (
      previousStatus !== null &&
      isActiveStatus(previousStatus) &&
      (next.run.status === "succeeded" ||
        next.run.status === "failed" ||
        next.run.status === "cancelled")
    ) {
      const message =
        next.run.status === "succeeded"
          ? t("workflowDetailPage.runCompleted", { id: next.run.id })
          : next.run.status === "failed"
            ? t("workflowDetailPage.runFailed", { id: next.run.id, detail: next.run.error || next.run.message || t("workflowDetailPage.k14") })
            : t("workflowDetailPage.runCancelled", { id: next.run.id });
      notify(
        message,
        next.run.status === "succeeded"
          ? "success"
          : next.run.status === "failed"
            ? "error"
            : "warning",
        6500
      );
    }
    previousStatus = next.run.status;
    detail.value = next;
    if (selectedStage.value) {
      const updated = next.stages.find((s) => s.id === selectedStage.value!.id);
      if (updated) selectedStage.value = updated;
    }
    error.value = "";
  } catch (e) {
    if (requestedId === Number(route.params.id)) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  } finally {
    loading.value = false;
    requestInFlight = false;
    if (requestedId !== Number(route.params.id)) {
      void load();
      return;
    }
    syncPolling();
  }
}

async function deleteRun() {
  if (!detail.value || deleting.value || !confirmingDelete.value) return;
  const run = detail.value.run;
  if (run.status === "running" || run.status === "pending") {
    notify(t("workflowDetailPage.k15"), "warning");
    return;
  }
  deleting.value = true;
  try {
    await api.deleteWorkflow(run.id);
    notify(t("workflowDetailPage.deletedRun", { id: run.id }), "success");
    await router.replace("/admin/workflows");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    deleting.value = false;
    confirmingDelete.value = false;
  }
}

async function cancelRun() {
  if (
    !detail.value ||
    cancelling.value ||
    detail.value.run.status !== "pending" ||
    !confirmingCancel.value
  ) {
    return;
  }
  cancelling.value = true;
  try {
    await api.cancelWorkflow(detail.value.run.id);
    confirmingCancel.value = false;
    await load();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    cancelling.value = false;
  }
}

watch(
  () => route.params.id,
  () => {
    previousStatus = null;
    detail.value = null;
    selectedStage.value = null;
    stageDetailCopyState.value = "";
    loading.value = true;
    error.value = "";
    confirmingDelete.value = false;
    confirmingCancel.value = false;
    void load();
  }
);

onMounted(() => {
  void load();
});

onUnmounted(() => {
  stopPolling();
  selectedStage.value = null;
});
</script>