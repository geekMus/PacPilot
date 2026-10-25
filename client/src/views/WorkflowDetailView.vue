<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type WorkflowDetail, type WorkflowStage } from "@/api/client";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppDialog from "@/components/AppDialog.vue";
import { DialogDescription, DialogTitle } from "reka-ui";
import { useCopyFeedback } from "@/composables/useCopyFeedback";
import AppFooter from "@/components/AppFooter.vue";
import ConfirmPopover from "@/components/ConfirmPopover.vue";
import { useToast } from "@/composables/useToast";
const { t, locale } = useI18n();

const route = useRoute();
const router = useRouter();
const { notify } = useToast();

const detail = ref<WorkflowDetail | null>(null);
const loading = ref(true);
const error = ref("");
const cancelling = ref(false);
const confirmingCancel = ref(false);

let previousStatus: string | null = null;
let pollHandle: ReturnType<typeof setInterval> | undefined;
let requestInFlight = false;

const selectedStage = ref<WorkflowStage | null>(null);
const stageDetailOpen = ref(false);
const { copyState: stageCopyState, copyWithFeedback, resetCopyState } = useCopyFeedback();

const statuses: Record<string, string> = {
  pending: "workflowDetailPage.k0",
  running: "workflowDetailPage.k1",
  succeeded: "workflowDetailPage.k2",
  failed: "workflowDetailPage.k3",
  cancelled: "workflowDetailPage.k4",
  skipped: "workflowDetailPage.k5",
};
const sources: Record<string, string> = {
  startup: "workflowDetailPage.k6",
  scheduled: "workflowDetailPage.k7",
  manual: "workflowDetailPage.k8",
  "save-and-generate": "workflowDetailPage.k9",
};

const isActiveStatus = (status: string | undefined) => status === "pending" || status === "running";

const label = (v: string) => (statuses[v] ? t(statuses[v]) : v);
const sourceLabel = (v: string) => (sources[v] ? t(sources[v]) : v);
const stageLabel = (key: string) => t(`workflow.stageNames.${key}`);
const dateLabel = (v: string | null) =>
  v ? new Date(v).toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN") : "—";

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

function openStageDetail(stage: WorkflowStage): void {
  selectedStage.value = stage;
  resetCopyState();
  stageDetailOpen.value = true;
}

function onStageDetailOpenChange(open: boolean): void {
  stageDetailOpen.value = open;
  if (!open) {
    selectedStage.value = null;
    resetCopyState();
  }
}

async function copyStageDetail(): Promise<void> {
  const stage = selectedStage.value;
  if (!stage) return;
  const text = [
    t("workflowDetailPage.stageName", {
      name: stageLabel(stage.stage_key),
    }),
    t("workflowDetailPage.stageKey", { key: stage.stage_key }),
    `${t("workflowDetailPage.k33")}：${label(stage.status)}`,
    t("workflowDetailPage.stageErr", {
      err: stage.error || "—",
    }),
    t("workflowDetailPage.stageStart", { time: dateLabel(stage.started_at) }),
    t("workflowDetailPage.stageEnd", { time: dateLabel(stage.finished_at) }),
    `${t("workflowDetailPage.k34")}：${stage.duration_ms == null ? "—" : stage.duration_ms + " ms"}`,
    "",
    t("workflowDetailPage.k11"),
    formatStageDetail(stage.detail),
  ].join("\n");
  await copyWithFeedback(text);
}

function durationLabel(s: WorkflowStage) {
  const ms = s.duration_ms ?? (s.started_at ? Date.now() - new Date(s.started_at).getTime() : null);
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return t("workflowDetailPage.sec", { n: (ms / 1000).toFixed(1) });
  return t("workflowDetailPage.minSec", {
    m: Math.floor(ms / 60000),
    s: Math.floor((ms % 60000) / 1000),
  });
}

function stageIconName(status: string) {
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
      await router.replace({ name: "login", query: { redirect: route.fullPath } });
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
            ? t("workflowDetailPage.runFailed", {
                id: next.run.id,
                detail: next.run.error || t("workflowDetailPage.k14"),
              })
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
    stageDetailOpen.value = false;
    resetCopyState();
    loading.value = true;
    error.value = "";
    confirmingCancel.value = false;
    void load();
  }
);

onMounted(() => {
  void load();
});

onUnmounted(() => {
  stopPolling();
  stageDetailOpen.value = false;
  selectedStage.value = null;
});
</script>

<template>
  <AdminLayout
    active="workflow"
    :title="t('workflow.detailTitle')"
    :subtitle="t('workflow.detailSubtitle')"
  >
    <div class="detail-page">
      <div v-if="error" class="error-panel" role="alert">
        <strong>{{ t("workflow.loadDetailFailed") }}</strong>
        <span>{{ error }}</span>
        <button type="button" class="app-button app-button--secondary" @click="load()">
          {{ t("common.retry") }}
        </button>
      </div>

      <section v-if="detail" class="detail-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">
              {{ t("workflowDetailPage.kickerExecution", { id: detail.run.id }) }}
            </p>
            <h2>{{ t("workflow.pacGeneration") }}</h2>
            <p class="muted">{{ t("workflow.fixedId") }}</p>
          </div>
          <span class="status" :class="detail.run.status">
            <AppIcon
              v-if="detail.run.status === 'running' || detail.run.status === 'pending'"
              :name="detail.run.status === 'pending' ? 'clock' : 'loader-circle'"
              :size="13"
              :class="{ spinning: detail.run.status === 'running' }"
            />
            {{ label(detail.run.status) }}
          </span>
        </div>
        <div class="meta-grid">
          <div>
            <span>{{ t("workflow.runId") }}</span>
            <strong>#{{ detail.run.id }}</strong>
          </div>
          <div>
            <span>{{ t("workflow.trigger") }}</span>
            <strong>{{ sourceLabel(detail.run.source) }}</strong>
          </div>
          <div>
            <span>{{ t("workflow.generateMode") }}</span>
            <strong>{{
              detail.run.mode === "remote" ? t("workflow.remoteMode") : t("workflow.customMode")
            }}</strong>
          </div>
          <div>
            <span>{{ t("workflow.startTime") }}</span>
            <strong>{{ dateLabel(detail.run.started_at || detail.run.created_at) }}</strong>
          </div>
          <div>
            <span>{{ t("workflow.endTime") }}</span>
            <strong>{{ dateLabel(detail.run.finished_at) }}</strong>
          </div>
          <div>
            <span>{{ t("workflow.totalDuration") }}</span>
            <strong>
              {{
                detail.run.duration_ms == null
                  ? detail.run.status === "running"
                    ? t("common.running")
                    : "—"
                  : detail.run.duration_ms + " ms"
              }}
            </strong>
          </div>
        </div>
        <div v-if="detail.run.error" class="failure-message">
          <strong
            ><AppIcon name="circle-alert" :size="16" /> {{ t("workflowDetailPage.k26") }}</strong
          >
          <pre>{{ detail.run.error }}</pre>
        </div>
      </section>

      <section v-if="detail" class="detail-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">{{ t("workflowDetailPage.kickerTimeline") }}</p>
            <h2>{{ t("workflowDetailPage.k27") }}</h2>
            <p class="muted">
              {{ t("workflowDetailPage.k28") }}
            </p>
          </div>
          <span class="muted">{{
            t("workflowDetailPage.stageCount", { n: detail.stages.length })
          }}</span>
        </div>
        <ol class="stage-list">
          <li v-for="(stage, index) in detail.stages" :key="stage.id" class="stage-item">
            <span class="stage-marker" :class="stage.status">
              <AppIcon
                :name="stageIconName(stage.status)"
                :size="16"
                :class="{ spinning: stage.status === 'running' }"
              />
            </span>
            <div class="stage-body">
              <div class="stage-heading">
                <div class="stage-heading-main">
                  <span class="stage-number">{{
                    t("workflowDetailPage.stageIndex", { n: index + 1 })
                  }}</span>
                  <button
                    type="button"
                    class="stage-name-trigger"
                    :title="t('workflowDetailPage.k17')"
                    @click="openStageDetail(stage)"
                  >
                    {{ stageLabel(stage.stage_key) }}
                  </button>
                </div>
                <span class="status" :class="stage.status">{{ label(stage.status) }}</span>
              </div>
              <div class="stage-meta">
                <span>{{
                  t("workflowDetailPage.stageStart", { time: dateLabel(stage.started_at) })
                }}</span>
                <span>{{
                  t("workflowDetailPage.stageEnd", { time: dateLabel(stage.finished_at) })
                }}</span>
                <span>{{ t("workflowDetailPage.k34") }}：{{ durationLabel(stage) }}</span>
              </div>
              <pre v-if="stage.error" class="stage-error">{{ stage.error }}</pre>
            </div>
          </li>
          <li v-if="!detail.stages.length" class="no-stages">
            <AppIcon name="info" :size="17" />
            {{ t("workflowDetailPage.k29") }}
          </li>
        </ol>
      </section>

      <div v-else-if="loading" class="detail-panel loading" aria-live="polite">
        <AppIcon name="loader-circle" :size="20" class="spinning" />
        {{ t("workflowDetailPage.k30") }}
      </div>

      <AppDialog
        :open="stageDetailOpen && !!selectedStage"
        :label="t('workflowDetailPage.k19')"
        width="min(640px, calc(100vw - 16px))"
        body-class="stage-detail-dialog-body"
        :close-label="t('workflowDetailPage.k20')"
        @update:open="onStageDetailOpenChange"
      >
        <template #header>
          <div class="stage-detail-heading">
            <p class="stage-detail-kicker">
              {{ t("workflowDetailPage.kickerStage", { name: selectedStage?.stage_key ?? "" }) }}
            </p>
            <DialogTitle class="stage-detail-title">
              {{ stageLabel(selectedStage?.stage_key ?? "") }}
            </DialogTitle>
            <DialogDescription class="app-dialog-visually-hidden">
              {{ t("workflowDetailPage.k36") }}. {{ t("workflowDetailPage.k37") }}
            </DialogDescription>
          </div>
        </template>
        <template #header-actions>
          <button
            class="app-button app-button--sm app-button--secondary"
            :class="{
              'is-copy-success': stageCopyState === 'success',
              'is-copy-error': stageCopyState === 'error',
            }"
            type="button"
            aria-live="polite"
            @click="copyStageDetail"
          >
            <AppIcon
              :name="
                stageCopyState === 'success'
                  ? 'circle-check'
                  : stageCopyState === 'error'
                    ? 'circle-x'
                    : 'copy'
              "
              :size="14"
            />{{
              stageCopyState === "success"
                ? t("common.copiedShort")
                : stageCopyState === "error"
                  ? t("common.copyFailed")
                  : t("workflowDetailPage.k31")
            }}
          </button>
        </template>
        <template #body>
          <div v-if="selectedStage" class="stage-detail-body">
            <section class="stage-detail-section">
              <h3 class="stage-detail-section-title">{{ t("workflowDetailPage.k32") }}</h3>
              <div class="stage-detail-meta">
                <div class="stage-detail-meta-card">
                  <span>{{ t("workflowDetailPage.k33") }}</span>
                  <strong>
                    <span class="status" :class="selectedStage.status">
                      {{ label(selectedStage.status) }}
                    </span>
                  </strong>
                </div>
                <div class="stage-detail-meta-card">
                  <span>{{ t("workflowDetailPage.k34") }}</span>
                  <strong>
                    {{
                      selectedStage.duration_ms == null ? "—" : selectedStage.duration_ms + " ms"
                    }}
                  </strong>
                </div>
                <div class="stage-detail-meta-card">
                  <span>{{ t("workflow.startTime") }}</span>
                  <strong>{{ dateLabel(selectedStage.started_at) }}</strong>
                </div>
                <div class="stage-detail-meta-card">
                  <span>{{ t("workflow.endTime") }}</span>
                  <strong>{{ dateLabel(selectedStage.finished_at) }}</strong>
                </div>
              </div>
            </section>
            <section v-if="selectedStage.error" class="stage-detail-section">
              <h3 class="stage-detail-section-title">{{ t("workflowDetailPage.k35") }}</h3>
              <pre class="stage-detail-pre is-error">{{ selectedStage.error }}</pre>
            </section>
            <section class="stage-detail-section">
              <h3 class="stage-detail-section-title">{{ t("workflowDetailPage.k36") }}</h3>
              <p class="stage-detail-hint">
                {{ t("workflowDetailPage.k37") }}
              </p>
              <pre class="stage-detail-pre">{{ formatStageDetail(selectedStage.detail) }}</pre>
            </section>
          </div>
        </template>
      </AppDialog>

      <div v-if="detail" class="detail-page-actions">
        <RouterLink class="back-link" to="/admin/workflows">
          <AppIcon name="arrow-left" :size="16" /> {{ t("workflowDetailPage.k38") }}
        </RouterLink>
        <div class="detail-action-group">
          <ConfirmPopover
            v-if="detail.run.status === 'pending'"
            :open="confirmingCancel"
            :title="t('workflowDetailPage.k40')"
            :description="t('workflowDetailPage.k41')"
            :confirm-text="t('workflowDetailPage.k43')"
            :cancel-text="t('workflowDetailPage.k42')"
            :busy-text="t('workflowDetailPage.cancellingTitle')"
            tone="warning"
            :busy="cancelling"
            @update:open="confirmingCancel = $event"
            @confirm="cancelRun"
          >
            <template #trigger="{ toggle }">
              <button
                class="app-button app-button--danger-ghost"
                type="button"
                :disabled="cancelling"
                :title="
                  cancelling
                    ? t('workflowDetailPage.cancellingTitle')
                    : t('workflowDetailPage.cancelQueuedTitle')
                "
                @click="toggle()"
              >
                <AppIcon name="x" :size="15" /> {{ t("workflowDetailPage.k39") }}
              </button>
            </template>
          </ConfirmPopover>
        </div>
      </div>
    </div>
    <AppFooter />
  </AdminLayout>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.detail-page {
  @apply grid gap-[18px];
}
.detail-panel {
  @apply min-w-0 rounded-[14px] border p-[22px];
  border-color: var(--line);
  background: var(--surface);
}
.panel-heading {
  @apply mb-4 flex items-start justify-between gap-3;
}
.eyebrow {
  @apply mb-1 mt-0 text-[10px] font-extrabold tracking-[0.12em];
  color: var(--muted);
}
.panel-heading h2 {
  @apply m-0 text-[1.15rem] font-extrabold tracking-tight;
}
.muted {
  @apply mb-0 mt-1.5 text-xs leading-normal;
  color: var(--muted);
}
.meta-grid {
  @apply mb-3.5 grid grid-cols-3 gap-3;
}
.meta-grid div {
  @apply grid min-w-0 gap-1;
}
.meta-grid span {
  @apply text-[11px];
  color: var(--muted);
}
.meta-grid strong {
  @apply text-[13px];
  overflow-wrap: anywhere;
}
.failure-message {
  @apply mt-3 grid gap-1.5;
}
.failure-message strong {
  @apply inline-flex items-center gap-1.5 text-xs;
}
.failure-message pre {
  @apply m-0 text-[13px] leading-normal;
}
.failure-message pre {
  @apply whitespace-pre-wrap rounded-[10px] border px-3 py-[11px];
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
  background: var(--red-soft);
  color: var(--red);
  overflow-wrap: anywhere;
}
.status {
  @apply inline-flex min-h-7 items-center gap-[5px] whitespace-nowrap rounded-full border px-2.5 text-[11px] font-bold;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
}
.status.succeeded {
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 30%, var(--line));
  background: var(--green-soft);
}
.status.failed {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 30%, var(--line));
  background: var(--red-soft);
}
.status.running {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  background: var(--accent-soft);
}
.status.pending {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 30%, var(--line));
}
.stage-list {
  @apply m-0 list-none p-0;
}
.stage-item {
  @apply relative flex gap-3 pb-[22px];
}
.stage-item:last-child {
  @apply pb-0;
}
.stage-item:not(:last-child):before {
  @apply absolute bottom-0 left-[15px] top-8 w-px;
  background: var(--line);
  content: "";
}
.stage-marker {
  @apply z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full border;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
}
.stage-marker.succeeded {
  color: var(--green);
}
.stage-marker.failed {
  color: var(--red);
}
.stage-marker.running {
  color: var(--accent);
}
.stage-body {
  @apply min-w-0 flex-1 pt-0.5;
}
.stage-heading {
  @apply flex items-start justify-between gap-x-4 gap-y-3;
}
.stage-heading-main {
  @apply grid min-w-0 flex-1 gap-1;
}
.stage-number {
  @apply text-[10px] font-bold leading-tight tracking-[0.08em];
  color: var(--muted);
}
.stage-name-trigger {
  /* 无 Preflight 时 button 保留浏览器默认的 buttonface 底色，必须显式清除背景色。 */
  @apply inline w-fit max-w-full cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-bold tracking-tight no-underline transition-colors;
  color: var(--text);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.stage-name-trigger:hover,
.stage-name-trigger:focus-visible {
  @apply underline outline-none;
  color: var(--accent);
  text-underline-offset: 3px;
}
.stage-heading .status {
  @apply mt-0.5 shrink-0;
}
.stage-meta {
  @apply mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] leading-snug;
  color: var(--muted);
}
.stage-error {
  @apply mb-0 mt-2.5 whitespace-pre-wrap rounded-[10px] border px-3 py-2.5 text-xs leading-normal;
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
  background: var(--red-soft);
  color: var(--red);
  overflow-wrap: anywhere;
}
.no-stages,
.loading {
  @apply flex items-center gap-2.5 p-5 text-[13px];
  color: var(--muted);
}
.error-panel {
  @apply grid gap-2 rounded-[10px] border p-3.5 text-xs;
  border-color: var(--red);
  color: var(--red);
}
.detail-page-actions {
  @apply flex flex-wrap items-center justify-between gap-3 px-0.5 py-1;
}
.detail-action-group {
  @apply flex flex-wrap items-center gap-[9px];
}
.back-link {
  @apply inline-flex min-h-9 cursor-pointer items-center gap-[7px] rounded-lg border px-3 text-xs font-bold no-underline;
  border-color: var(--line);
  color: var(--text);
  background: var(--surface);
}
.spinning {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
.stage-detail-heading {
  @apply grid min-w-0 gap-1;
}
.stage-detail-title {
  @apply m-0 text-lg font-extrabold leading-snug tracking-tight;
  color: var(--text);
  overflow-wrap: anywhere;
}
.stage-detail-kicker {
  @apply mb-1 mt-0 text-[10px] font-extrabold tracking-[0.12em];
  color: var(--muted);
}
.app-button.is-copy-success {
  border-color: color-mix(in srgb, var(--green) 55%, var(--line));
  color: var(--green);
}
.app-button.is-copy-error {
  border-color: color-mix(in srgb, var(--red) 55%, var(--line));
  color: var(--red);
}
.stage-detail-body {
  @apply grid gap-4 p-0;
}
.stage-detail-section {
  @apply grid min-w-0 gap-2;
}
.stage-detail-section-title {
  @apply m-0 text-[11px] font-bold;
  color: var(--muted);
}
.stage-detail-hint {
  @apply m-0 text-[11px] leading-normal;
  color: var(--muted);
}
.stage-detail-meta {
  @apply grid grid-cols-2 gap-3;
}
.stage-detail-meta-card {
  @apply grid min-w-0 gap-1;
}
.stage-detail-meta-card span {
  @apply text-[11px];
  color: var(--muted);
}
.stage-detail-meta-card strong {
  @apply text-xs leading-snug;
  overflow-wrap: anywhere;
}
.stage-detail-pre {
  @apply m-0 whitespace-pre-wrap rounded-[10px] border px-3 py-[11px] font-mono text-xs leading-normal;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--text);
  overflow-wrap: anywhere;
}
.stage-detail-pre.is-error {
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
@media (max-width: 650px) {
  .detail-panel {
    @apply p-[15px];
  }
  .meta-grid {
    @apply grid-cols-2;
  }
  .stage-heading {
    @apply flex-col items-start gap-2;
  }
  .stage-heading .status {
    @apply mt-0;
  }
  .stage-name-trigger {
    @apply text-[13px];
  }
  .stage-meta {
    @apply mt-2 gap-x-3 gap-y-1;
  }
  .detail-page-actions {
    @apply sticky bottom-2 z-10 rounded-xl border p-2.5;
    border-color: var(--line);
    background: var(--surface);
    box-shadow: 0 6px 24px #00000012;
  }
  .detail-page-actions > .back-link {
    @apply flex-1;
  }
  .detail-action-group {
    @apply shrink-0;
  }
  .stage-detail-body {
    @apply gap-3.5;
  }
  .stage-detail-meta {
    @apply grid-cols-1 gap-2.5;
  }
  .stage-detail-pre {
    @apply text-[11px];
    max-height: min(36vh, 240px);
  }
}
.stage-detail-body {
  @apply p-0;
}
:deep(.stage-detail-dialog-body .app-scroll-area-viewport) {
  @apply px-[18px] py-4;
}
@media (max-width: 560px) {
  :deep(.stage-detail-dialog-body .app-scroll-area-viewport) {
    @apply p-3.5;
  }
}
</style>
