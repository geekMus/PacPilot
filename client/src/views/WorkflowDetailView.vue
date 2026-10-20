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
  pending: "等待执行",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  skipped: "已跳过",
};
const sources: Record<string, string> = {
  startup: "服务启动",
  scheduled: "定时任务",
  manual: "手动生成",
  "save-and-generate": "保存并生成",
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
  if (!raw || !String(raw).trim()) return "（无详细记录）";
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
    `阶段：${stage.name}`,
    `键：${stage.stage_key}`,
    `状态：${label(stage.status)}`,
    `说明：${stage.message || "—"}`,
    `错误：${stage.error || "—"}`,
    `开始：${dateLabel(stage.started_at)}`,
    `结束：${dateLabel(stage.finished_at)}`,
    `耗时：${stage.duration_ms == null ? "—" : stage.duration_ms + " ms"}`,
    "",
    "详情：",
    formatStageDetail(stage.detail),
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    stageDetailCopyState.value = "已复制到剪贴板";
  } catch {
    stageDetailCopyState.value = "当前环境无法自动复制，请选中文本后手动复制。";
  }
}

function durationLabel(s: WorkflowStage) {
  const ms = s.duration_ms ?? (s.started_at ? Date.now() - new Date(s.started_at).getTime() : null);
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + " 秒";
  return Math.floor(ms / 60000) + " 分 " + Math.floor((ms % 60000) / 1000) + " 秒";
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
          ? `工作流 #${next.run.id} 已执行完成`
          : next.run.status === "failed"
            ? `工作流 #${next.run.id} 执行失败：${next.run.error || next.run.message || "请查看执行详情"}`
            : `工作流 #${next.run.id} 已取消排队`;
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
    notify("等待中或执行中的工作流不能删除。", "warning");
    return;
  }
  deleting.value = true;
  try {
    await api.deleteWorkflow(run.id);
    notify(`工作流执行记录 #${run.id} 已删除`, "success");
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
        <button type="button" @click="load()">{{ t("common.retry") }}</button>
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
            <strong>{{ detail.run.mode === "remote" ? t("workflow.remoteMode") : t("workflow.customMode") }}</strong>
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
          <p>{{ detail.run.message || "暂无结果信息" }}</p>
        </div>
        <div v-if="detail.run.error" class="failure-message">
          <strong><AppIcon name="circle-alert" :size="16" /> 失败原因</strong>
          <pre>{{ detail.run.error }}</pre>
        </div>
      </section>

      <section v-if="detail" class="detail-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">STAGE TIMELINE</p>
            <h2>阶段执行情况</h2>
            <p class="muted">
              阶段记录由服务端持久化，刷新页面不会丢失。点击阶段名称可查看请求与配置等详细信息。
            </p>
          </div>
          <span class="muted">{{ detail.stages.length }} 个阶段</span>
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
                  <span class="stage-number">阶段 {{ index + 1 }}</span>
                  <button
                    type="button"
                    class="stage-name-trigger"
                    title="查看阶段详情"
                    @click="openStageDetail(stage)"
                  >
                    {{ stage.name }}
                  </button>
                </div>
                <span class="status" :class="stage.status">{{ label(stage.status) }}</span>
              </div>
              <p>{{ stage.message || "暂无阶段说明" }}</p>
              <div class="stage-meta">
                <span>开始：{{ dateLabel(stage.started_at) }}</span>
                <span>结束：{{ dateLabel(stage.finished_at) }}</span>
                <span>耗时：{{ durationLabel(stage) }}</span>
              </div>
              <pre v-if="stage.error" class="stage-error">{{ stage.error }}</pre>
            </div>
          </li>
          <li v-if="!detail.stages.length" class="no-stages">
            <AppIcon name="info" :size="17" />
            此执行记录没有阶段数据（例如升级前创建的历史任务）。
          </li>
        </ol>
      </section>

      <div v-else-if="loading" class="detail-panel loading" aria-live="polite">
        <AppIcon name="loader-circle" :size="20" class="spinning" />
        正在加载执行详情…
      </div>

      <dialog
        v-if="selectedStage"
        ref="stageDetailDialog"
        class="stage-detail-dialog"
        aria-label="工作流阶段详情"
        @click="handleStageDetailBackdrop"
        @close="onStageDetailClose"
      >
        <div class="stage-detail-shell">
          <header class="stage-detail-header">
            <div>
              <p class="stage-detail-kicker">STAGE · {{ selectedStage.stage_key }}</p>
              <h2>{{ selectedStage.name }}</h2>
            </div>
            <div class="stage-detail-actions">
              <button class="stage-detail-btn" type="button" @click="copyStageDetail">
                <AppIcon name="copy" :size="14" />复制
              </button>
              <button
                class="stage-detail-btn"
                type="button"
                aria-label="关闭"
                @click="closeStageDetail"
              >
                <AppIcon name="x" :size="14" />
              </button>
            </div>
          </header>
          <p v-if="stageDetailCopyState" class="stage-detail-copy" role="status">
            {{ stageDetailCopyState }}
          </p>
          <div class="stage-detail-body">
            <p v-if="selectedStage.message" class="stage-detail-message">
              {{ selectedStage.message }}
            </p>
            <section class="stage-detail-section">
              <h3 class="stage-detail-section-title">基本信息</h3>
              <div class="stage-detail-meta">
                <div class="stage-detail-meta-card">
                  <span>状态</span>
                  <strong>
                    <span class="status" :class="selectedStage.status">
                      {{ label(selectedStage.status) }}
                    </span>
                  </strong>
                </div>
                <div class="stage-detail-meta-card">
                  <span>耗时</span>
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
              <h3 class="stage-detail-section-title">错误信息</h3>
              <pre class="stage-detail-pre is-error">{{ selectedStage.error }}</pre>
            </section>
            <section class="stage-detail-section">
              <h3 class="stage-detail-section-title">诊断详情</h3>
              <p class="stage-detail-hint">
                包含配置摘要、远程请求与响应头、输出文件与 Webhook 等结构化记录。
              </p>
              <pre class="stage-detail-pre">{{ formatStageDetail(selectedStage.detail) }}</pre>
            </section>
          </div>
        </div>
      </dialog>

      <div v-if="detail" class="detail-page-actions">
        <RouterLink class="back-link" to="/admin/workflows">
          <AppIcon name="arrow-left" :size="16" /> 返回工作流记录
        </RouterLink>
        <div class="detail-action-group">
          <div v-if="detail.run.status === 'pending'" class="detail-confirm-anchor">
            <button
              class="cancel-button"
              type="button"
              :disabled="cancelling"
              :title="cancelling ? '正在取消工作流，请稍候' : '取消当前等待中的工作流'"
              @click="
                confirmingCancel = !confirmingCancel;
                confirmingDelete = false;
              "
            >
              <AppIcon name="x" :size="15" /> 取消排队
            </button>
            <div
              v-if="confirmingCancel"
              class="detail-confirm-popover cancel-confirm-popover"
              role="group"
            >
              <strong>取消这条等待任务？</strong>
              <span>取消后任务不会继续执行，但记录仍会保留。</span>
              <div>
                <button type="button" class="confirm-cancel" @click="confirmingCancel = false">
                  返回
                </button>
                <button
                  type="button"
                  class="confirm-cancel-action"
                  :disabled="cancelling"
                  :title="cancelling ? '正在取消工作流，请稍候' : '确认取消工作流'"
                  @click="cancelRun"
                >
                  确认取消
                </button>
              </div>
            </div>
          </div>
          <div class="detail-confirm-anchor">
            <button
              class="delete-button"
              type="button"
              :disabled="
                deleting || detail.run.status === 'running' || detail.run.status === 'pending'
              "
              :title="
                detail.run.status === 'running' || detail.run.status === 'pending'
                  ? '等待中或执行中的工作流不能删除'
                  : deleting
                    ? '正在删除，请稍候'
                    : '删除本条执行记录'
              "
              @click="
                confirmingDelete = !confirmingDelete;
                confirmingCancel = false;
              "
            >
              <AppIcon name="trash-2" :size="15" /> 删除记录
            </button>
            <div v-if="confirmingDelete" class="detail-confirm-popover" role="group">
              <strong>删除本条执行记录？</strong>
              <span>删除后无法恢复，阶段时间线也会一并清除。</span>
              <div>
                <button type="button" class="confirm-cancel" @click="confirmingDelete = false">
                  返回
                </button>
                <button
                  type="button"
                  class="confirm-delete"
                  :disabled="deleting"
                  @click="deleteRun"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
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
.back-link,
.delete-button,
.cancel-button {
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
.delete-button {
  color: var(--red);
}
.cancel-button {
  color: var(--muted);
}
.delete-button:disabled,
.cancel-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.detail-confirm-anchor {
  position: relative;
}
.detail-confirm-popover {
  position: absolute;
  z-index: 30;
  right: 0;
  top: calc(100% + 7px);
  width: 245px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
}
.cancel-confirm-popover {
  border-color: color-mix(in srgb, var(--amber, #d97706) 35%, var(--line));
}
.detail-confirm-popover strong,
.detail-confirm-popover span {
  display: block;
}
.detail-confirm-popover strong {
  font-size: 12px;
  color: var(--text);
}
.detail-confirm-popover span {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
}
.detail-confirm-popover > div {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 12px;
}
.detail-confirm-popover button {
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.detail-confirm-popover .confirm-delete {
  background: var(--red);
  border-color: var(--red);
  color: white;
}
.detail-confirm-popover .confirm-cancel-action {
  background: var(--amber-soft, #fff3dc);
  border-color: color-mix(in srgb, var(--amber, #d97706) 40%, var(--line));
  color: var(--amber, #b45309);
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

.stage-detail-dialog {
  width: min(640px, calc(100vw - 24px));
  max-height: min(86dvh, 820px);
  margin: auto;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--text) 18%, transparent);
  overflow: auto;
}
.stage-detail-dialog::backdrop {
  background: rgba(12, 16, 24, 0.45);
}
.stage-detail-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.stage-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}
.stage-detail-kicker {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.stage-detail-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.stage-detail-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
  flex-wrap: nowrap;
}
.stage-detail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  min-width: 38px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition:
    filter 0.15s,
    opacity 0.15s,
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}
.stage-detail-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.stage-detail-copy {
  margin: 0;
  padding: 8px 18px;
  color: var(--green);
  font-size: 12px;
}
.stage-detail-body {
  display: grid;
  gap: 16px;
  padding: 14px 18px 18px;
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
  max-height: 220px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}
.stage-detail-pre.is-error {
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
  background: var(--red-soft);
  color: var(--red);
  max-height: 160px;
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
  .stage-detail-dialog {
    width: calc(100vw - 16px);
    max-height: min(90dvh, 100%);
    border-radius: 12px;
  }
  .stage-detail-header {
    padding: 14px 14px 10px;
    gap: 10px;
  }
  .stage-detail-header h2 {
    font-size: 16px;
  }
  .stage-detail-btn {
    min-height: 36px;
    min-width: 36px;
    padding: 0 12px;
  }
  .stage-detail-body {
    padding: 12px 14px 16px;
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
  .stage-detail-copy {
    padding: 8px 14px;
  }
}
</style>
