<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
const deleting = ref(false);
const confirmingDelete = ref(false);
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
    t("workflowDetailPage.stageMsg", {
      msg: label(stage.status),
    }),
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
      await router.replace("/admin/login");
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
    stageDetailOpen.value = false;
    resetCopyState();
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
        <button type="button" class="app-button app-button--secondary" @click="load()">{{ t("common.retry") }}</button>
      </div>

      <section v-if="detail" class="detail-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">EXECUTION #{{ detail.run.id }}</p>
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
        <div class="result-message">
          <strong>{{ t("workflow.result") }}</strong>
          <p>
            {{ label(detail.run.status) }}
          </p>
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
            <p class="eyebrow">STAGE TIMELINE</p>
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
              <p>
                {{ label(stage.status) }}
              </p>
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
            <p class="stage-detail-kicker">STAGE · {{ selectedStage?.stage_key ?? "" }}</p>
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
                :class="{ 'is-copy-success': stageCopyState === 'success', 'is-copy-error': stageCopyState === 'error' }"
                type="button"
                aria-live="polite"
                @click="copyStageDetail"
              >
                <AppIcon
                  :name="stageCopyState === 'success' ? 'circle-check' : stageCopyState === 'error' ? 'circle-x' : 'copy'"
                  :size="14"
                />{{ stageCopyState === 'success' ? t("common.copiedShort") : stageCopyState === 'error' ? t("common.copyFailed") : t("workflowDetailPage.k31") }}
          </button>
        </template>
        <template #body>
          <div v-if="selectedStage" class="stage-detail-body">
            <p class="stage-detail-message">
              {{ label(selectedStage.status) }}
            </p>
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
                @click="
                  confirmingDelete = false;
                  toggle();
                "
              >
                <AppIcon name="x" :size="15" /> {{ t("workflowDetailPage.k39") }}
              </button>
            </template>
          </ConfirmPopover>
          <ConfirmPopover
            :open="confirmingDelete"
            :title="t('workflowDetailPage.k45')"
            :description="t('workflowDetailPage.k46')"
            :confirm-text="t('workflowDetailPage.k47')"
            :cancel-text="t('workflowDetailPage.k42')"
            :busy-text="t('workflowDetailPage.k24')"
            :busy="deleting"
            @update:open="confirmingDelete = $event"
            @confirm="deleteRun"
          >
            <template #trigger="{ toggle }">
              <button
                class="app-button app-button--danger"
                type="button"
                :disabled="
                  deleting || detail.run.status === 'running' || detail.run.status === 'pending'
                "
                :title="
                  detail.run.status === 'running' || detail.run.status === 'pending'
                    ? t('workflowDetailPage.k23')
                    : deleting
                      ? t('workflowDetailPage.k24')
                      : t('workflowDetailPage.k25')
                "
                @click="
                  confirmingCancel = false;
                  toggle();
                "
              >
                <AppIcon name="trash-2" :size="15" /> {{ t("workflowDetailPage.k44") }}
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
.detail-page {
  display: grid;
  gap: 18px;
}
.detail-panel {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.eyebrow {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.panel-heading h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.muted {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.meta-grid div {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.meta-grid span {
  color: var(--muted);
  font-size: 11px;
}
.meta-grid strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.result-message,
.failure-message {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}
.result-message strong,
.failure-message strong {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.result-message p,
.failure-message pre {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
}
.failure-message pre {
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--red) 28%, var(--line));
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
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
  color: var(--warn, #b45309);
  border-color: color-mix(in srgb, var(--warn, #d97706) 30%, var(--line));
}
.stage-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.stage-item {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 22px;
}
.stage-item:last-child {
  padding-bottom: 0;
}
.stage-item:not(:last-child):before {
  content: "";
  position: absolute;
  left: 15px;
  top: 32px;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.stage-marker {
  z-index: 1;
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 50%;
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
  flex: 1;
  min-width: 0;
  padding: 2px 0 0;
}
.stage-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px 16px;
}
.stage-heading-main {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.stage-number {
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
}
.stage-name-trigger {
  display: inline;
  width: fit-content;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  overflow-wrap: anywhere;
  transition: color 0.15s;
}
.stage-name-trigger:hover,
.stage-name-trigger:focus-visible {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  outline: none;
}
.stage-heading .status {
  flex: 0 0 auto;
  margin-top: 2px;
}
.stage-body > p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.stage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.stage-error {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--red) 28%, var(--line));
  border-radius: 10px;
  background: var(--red-soft);
  color: var(--red);
  font: inherit;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.no-stages,
.loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px;
  color: var(--muted);
  font-size: 13px;
}
.error-panel {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--red);
  border-radius: 10px;
  color: var(--red);
  font-size: 12px;
}
.detail-page-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px 2px;
}
.detail-action-group {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  font-size: 12px;
  font-weight: 700;
  background: var(--surface);
  cursor: pointer;
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
  display: grid;
  gap: 4px;
  min-width: 0;
}
.stage-detail-title {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.stage-detail-kicker {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.app-button.is-copy-success {
  border-color: color-mix(in srgb, var(--green) 55%, var(--line));
  color: var(--green);
}
.app-button.is-copy-error {
  border-color: color-mix(in srgb, var(--red, #dc2626) 55%, var(--line));
  color: var(--red, #dc2626);
}
.stage-detail-body {
  display: grid;
  gap: 16px;
  padding: 0;
}
.stage-detail-message {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.stage-detail-section {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.stage-detail-section-title {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.stage-detail-hint {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.stage-detail-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stage-detail-meta-card {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.stage-detail-meta-card span {
  color: var(--muted);
  font-size: 11px;
}
.stage-detail-meta-card strong {
  font-size: 12px;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.stage-detail-pre {
  margin: 0;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.stage-detail-pre.is-error {
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}

@media (max-width: 650px) {
  .detail-panel {
    padding: 15px;
  }
  .meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stage-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .stage-heading .status {
    margin-top: 0;
  }
  .stage-name-trigger {
    font-size: 13px;
  }
  .stage-meta {
    gap: 4px 12px;
    margin-top: 8px;
  }
  .detail-page-actions {
    position: sticky;
    bottom: 8px;
    z-index: 10;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 6px 24px #00000012;
  }
  .detail-page-actions > .back-link {
    flex: 1;
  }
  .detail-action-group {
    flex: 0 0 auto;
  }
  .stage-detail-body {
    gap: 14px;
  }
  .stage-detail-meta {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .stage-detail-pre {
    max-height: min(36vh, 240px);
    font-size: 11px;
  }
}
.stage-detail-body {
  padding: 0;
}
:deep(.stage-detail-dialog-body .app-scroll-area-viewport) {
  padding: 16px 18px;
}
@media (max-width: 560px) {
  :deep(.stage-detail-dialog-body .app-scroll-area-viewport) {
    padding: 14px;
  }
}
</style>
