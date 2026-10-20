<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type WorkflowRun } from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import ConfirmPopover from "../components/ConfirmPopover.vue";
import VirtualTable from "../components/VirtualTable.vue";
import SelectField from "../components/SelectField.vue";
import { useToast } from "../composables/useToast";

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
  pending: "等待执行",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};
const sourceNames: Record<string, string> = {
  startup: "服务启动",
  scheduled: "定时任务",
  manual: "手动生成",
  "save-and-generate": "保存并生成",
};
const statusLabel = (status: string) => statusNames[status] ?? status;
const sourceLabel = (source: string) => sourceNames[source] ?? source;
const modeLabel = (mode: string) =>
  mode === "remote" ? "远程规则" : mode === "custom" ? "自定义规则" : mode || "—";
const durationLabel = (run: WorkflowRun) => {
  const ms =
    run.duration_ms ?? (run.started_at ? Date.now() - new Date(run.started_at).getTime() : null);
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + " 秒";
  return Math.floor(ms / 60000) + " 分 " + Math.floor((ms % 60000) / 1000) + " 秒";
};
const dateLabel = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

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
    if (session.mustChangePassword) {
      await router.replace("/admin/settings");
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
              ? `工作流 #${run.id} 已执行完成`
              : run.status === "failed"
                ? `工作流 #${run.id} 执行失败：${run.error || run.message || "请查看执行详情"}`
                : `工作流 #${run.id} 已取消排队`;
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
function toggleCurrentCancel() {
  const opening = !confirmingCurrentCancel.value;
  resetConfirmations();
  confirmingCurrentCancel.value = opening;
}
function toggleQueueCancel(run: WorkflowRun) {
  const opening = confirmingQueueCancelId.value !== run.id;
  resetConfirmations();
  confirmingQueueCancelId.value = opening ? run.id : null;
}
function toggleHistoryCancel(run: WorkflowRun) {
  const opening = confirmingHistoryCancelId.value !== run.id;
  resetConfirmations();
  confirmingHistoryCancelId.value = opening ? run.id : null;
}
function toggleHistoryDelete(run: WorkflowRun) {
  const opening = confirmingHistoryDeleteId.value !== run.id;
  resetConfirmations();
  confirmingHistoryDeleteId.value = opening ? run.id : null;
}
function toggleHistoryClear(toggle: () => void, isOpen: boolean) {
  // Closing keeps the component's normal behavior; opening first closes any
  // per-row confirmation that might otherwise remain visible beside this one.
  if (!isOpen) resetConfirmations();
  toggle();
}
const historyClearDisabledReason = computed(() => {
  if (loading.value) return "正在加载执行历史，请稍候";
  if (clearingHistory.value) return "正在清空执行历史";
  if (activeRuns.value.length > 0) return "仍有工作流正在等待或执行，结束后才能清空历史";
  if (runs.value.length === 0) return "当前没有可清空的执行记录";
  if (deletingId.value !== null) return "正在删除执行记录，请稍候";
  if (cancellingId.value !== null) return "正在取消工作流，请稍候";
  return "清空全部工作流执行历史";
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
    notify(`已清空 ${result.deletedRuns} 条工作流执行历史及其阶段详情。`, "success");
  } catch (caught) {
    notify(caught instanceof Error ? caught.message : String(caught), "error");
  } finally {
    clearingHistory.value = false;
  }
}
async function deleteRun(run: WorkflowRun) {
  if (deletingId.value !== null || confirmingHistoryDeleteId.value !== run.id) return;
  if (run.status === "running" || run.status === "pending") {
    notify("等待中或执行中的工作流不能删除。", "warning");
    return;
  }
  deletingId.value = run.id;
  try {
    await api.deleteWorkflow(run.id);
    runs.value = runs.value.filter((item) => item.id !== run.id);
    previousStatuses.delete(run.id);
    confirmingHistoryDeleteId.value = null;
    notify(`工作流执行记录 #${run.id} 已删除`, "success");
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
</script>

<template>
  <AdminLayout
    active="workflow"
    title="工作流"
    subtitle="查看 PAC 生成任务的实时状态、执行阶段与历史记录。"
  >
    <template #actions>
      <button
        class="workflow-button secondary"
        type="button"
        :disabled="refreshing"
        :title="refreshing ? '正在刷新工作流状态，请稍候' : '刷新工作流状态'"
        @click="load()"
      >
        <AppIcon
          :name="refreshing ? 'loader-circle' : 'refresh-cw'"
          :size="15"
          :class="{ spinning: refreshing }"
        />
        {{ refreshing ? "刷新中…" : "刷新" }}
      </button>
      <RouterLink class="workflow-button primary" to="/admin/settings">配置设置</RouterLink>
    </template>

    <div class="workflow-page">
      <div v-if="error" class="workflow-alert error" role="alert">
        <strong>读取工作流失败</strong>
        <span>{{ error }}</span>
        <button type="button" @click="load()">重试</button>
      </div>

      <section class="workflow-current panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">WORKFLOW CATALOG</p>
            <h2>工作流定义</h2>
            <p class="panel-subtitle">名称与标识固定，触发来源可以有多种。</p>
          </div>
          <span class="count-pill">1 个工作流</span>
        </div>
        <div class="catalog-item">
          <div class="current-icon"><AppIcon name="workflow" :size="22" /></div>
          <div class="catalog-copy">
            <strong>PAC 生成工作流</strong
            ><span>根据当前配置生成 PAC 文件，并记录每次执行结果。</span
            ><small
              >标识：pac-generation · 触发方式：服务启动、定时任务、手动生成、保存并生成</small
            >
          </div>
          <span class="read-only-pill">只读</span>
        </div>
      </section>

      <section class="workflow-current panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">CURRENT TASK</p>
            <h2>当前工作流</h2>
          </div>
          <span class="status-pill" :class="active ? current!.status : 'idle'"
            ><AppIcon
              v-if="active && (current!.status === 'running' || current!.status === 'pending')"
              :name="current!.status === 'pending' ? 'clock' : 'loader-circle'"
              :size="13"
              :class="{ spinning: current!.status === 'running' }"
            />{{ active ? statusLabel(current!.status) : "空闲" }}</span
          >
        </div>
        <template v-if="current">
          <div class="current-main">
            <div class="current-icon">
              <AppIcon
                :name="
                  current.status === 'failed'
                    ? 'circle-alert'
                    : current.status === 'running'
                      ? 'loader-circle'
                      : current.status === 'pending'
                        ? 'clock'
                        : current.status === 'succeeded'
                          ? 'check-circle-2'
                          : 'workflow'
                "
                :size="23"
                :class="{ spinning: current.status === 'running' }"
              />
            </div>
            <div class="current-copy">
              <strong>{{ sourceLabel(current.source) }}</strong>
              <span>{{ current.stage || "正在准备任务" }}</span>
            </div>
          </div>
          <p class="current-message">{{ current.message }}</p>
          <div class="current-meta">
            <div>
              <span>任务编号</span><strong>#{{ current.id }}</strong>
            </div>
            <div>
              <span>生成模式</span><strong>{{ modeLabel(current.mode) }}</strong>
            </div>
            <div>
              <span>开始时间</span
              ><strong>{{ dateLabel(current.started_at || current.created_at) }}</strong>
            </div>
            <div>
              <span>已运行</span><strong>{{ durationLabel(current) }}</strong>
            </div>
          </div>
          <div class="current-actions">
            <RouterLink class="workflow-button secondary" :to="`/admin/workflows/${current.id}`"
              ><AppIcon name="external-link" :size="14" /> 查看详情</RouterLink
            >
            <div v-if="current.status === 'pending'" class="confirm-anchor">
              <button
                class="workflow-button cancel-button"
                type="button"
                :disabled="cancellingId === current.id"
                :title="
                  cancellingId === current.id
                    ? '正在取消当前工作流，请稍候'
                    : '取消当前排队中的工作流'
                "
                @click="toggleCurrentCancel()"
              >
                <AppIcon name="x" :size="14" /> 取消排队
              </button>
              <div
                v-if="confirmingCurrentCancel"
                class="confirm-popover cancel-popover"
                role="group"
              >
                <strong>取消这条等待任务？</strong><span>取消后将不再执行，但保留执行记录。</span>
                <div>
                  <button type="button" class="confirm-cancel" @click.stop="resetConfirmations()">
                    返回</button
                  ><button
                    type="button"
                    class="confirm-cancel-action"
                    :disabled="cancellingId === current.id"
                    :title="
                      cancellingId === current.id
                        ? '正在取消当前工作流，请稍候'
                        : '确认取消当前等待任务'
                    "
                    @click="cancelRun(current, 'current')"
                  >
                    {{ cancellingId === current.id ? "取消中…" : "确认取消" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="current.error" class="workflow-error-detail">
            <strong>错误详情</strong>
            <pre>{{ current.error }}</pre>
          </div>
        </template>
        <div v-else class="empty-current">
          <template v-if="loading">
            <span class="spinner" aria-hidden="true"></span>
            <strong>正在读取工作流状态…</strong>
          </template>
          <template v-else>
            <AppIcon name="check-circle-2" :size="26" />
            <strong>当前没有正在执行的工作流</strong>
          </template>
        </div>
      </section>

      <section v-if="otherActiveRuns.length" class="workflow-queue panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">ACTIVE QUEUE</p>
            <h2>其他运行与等待任务</h2>
            <p class="panel-subtitle">同类型任务按队列顺序执行；不同类型的工作流可以独立运行。</p>
          </div>
          <span class="count-pill">{{ otherActiveRuns.length }} 个任务</span>
        </div>
        <div class="queue-list">
          <div v-for="run in otherActiveRuns" :key="run.id" class="queue-item">
            <span class="queue-icon"
              ><AppIcon
                :name="run.status === 'running' ? 'loader-circle' : 'clock'"
                :size="17"
                :class="{ spinning: run.status === 'running' }"
            /></span>
            <div class="queue-copy">
              <div>
                <strong>#{{ run.id }} · {{ sourceLabel(run.source) }}</strong
                ><span class="status-pill" :class="run.status">{{ statusLabel(run.status) }}</span>
              </div>
              <p>{{ run.stage || run.message || "等待执行" }}</p>
            </div>
            <RouterLink class="workflow-button secondary" :to="`/admin/workflows/${run.id}`"
              >查看详情</RouterLink
            >
            <div v-if="run.status === 'pending'" class="confirm-anchor">
              <button
                class="workflow-button cancel-button"
                type="button"
                :disabled="cancellingId === run.id"
                :title="cancellingId === run.id ? '正在取消此工作流，请稍候' : '取消此条排队任务'"
                @click.stop="toggleQueueCancel(run)"
              >
                <AppIcon name="x" :size="14" /> 取消排队
              </button>
              <div
                v-if="confirmingQueueCancelId === run.id"
                class="confirm-popover cancel-popover"
                role="group"
              >
                <strong>取消这条等待任务？</strong><span>取消后将不再执行，但保留执行记录。</span>
                <div>
                  <button type="button" class="confirm-cancel" @click.stop="resetConfirmations()">
                    返回</button
                  ><button
                    type="button"
                    class="confirm-cancel-action"
                    :disabled="cancellingId === run.id"
                    :title="
                      cancellingId === run.id ? '正在取消此工作流，请稍候' : '确认取消此等待任务'
                    "
                    @click.stop="cancelRun(run, 'queue')"
                  >
                    {{ cancellingId === run.id ? "取消中…" : "确认取消" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="workflow-history panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">HISTORY</p>
            <h2>执行历史</h2>
            <p v-if="activeRuns.length" class="panel-subtitle">
              有工作流正在等待或执行，暂不能清空历史。
            </p>
          </div>
          <div class="history-heading-actions">
            <span class="count-pill"
              >匹配 {{ filteredRuns.length }} / 已加载 {{ runs.length }} 条</span
            >
            <ConfirmPopover
              :open="confirmingHistoryClear"
              title="清空工作流执行历史？"
              description="将删除全部工作流执行记录及其阶段详情，且无法撤销；生成日志、应用配置和 PAC 文件会保留。若有任务正在等待或执行，服务器会拒绝清理。"
              confirm-text="清空历史"
              busy-text="正在清理…"
              align="end"
              :disabled="
                loading ||
                clearingHistory ||
                activeRuns.length > 0 ||
                runs.length === 0 ||
                deletingId !== null ||
                cancellingId !== null
              "
              :disabled-reason="historyClearDisabledReason"
              :busy="clearingHistory"
              @update:open="confirmingHistoryClear = $event"
              @confirm="clearWorkflowHistory"
            >
              <template #trigger="{ toggle, open }"
                ><button
                  class="workflow-button history-clear-button"
                  type="button"
                  :aria-expanded="open"
                  :disabled="
                    loading ||
                    clearingHistory ||
                    activeRuns.length > 0 ||
                    runs.length === 0 ||
                    deletingId !== null ||
                    cancellingId !== null
                  "
                  :title="historyClearDisabledReason"
                  @click="toggleHistoryClear(toggle, open)"
                >
                  <AppIcon
                    :name="clearingHistory ? 'loader-circle' : 'trash-2'"
                    :size="15"
                    :class="{ spinning: clearingHistory }"
                  />
                  {{ clearingHistory ? "正在清理…" : "清空执行历史" }}
                </button></template
              >
            </ConfirmPopover>
          </div>
        </div>
        <p
          v-if="historyClearDisabledReason !== '清空全部工作流执行历史' && activeRuns.length === 0"
          class="history-disabled-hint"
          aria-live="polite"
        >
          {{ historyClearDisabledReason }}
        </p>
        <div class="history-filters" aria-label="筛选工作流历史">
          <label
            >执行状态
            <SelectField
              ><select v-model="selectedStatus">
                <option value="all">全部状态</option>
                <option value="pending">等待执行</option>
                <option value="running">执行中</option>
                <option value="succeeded">成功</option>
                <option value="failed">失败</option>
                <option value="cancelled">已取消</option>
              </select></SelectField
            >
          </label>
          <label
            >任务来源
            <SelectField
              ><select v-model="selectedSource">
                <option value="all">全部来源</option>
                <option value="startup">服务启动</option>
                <option value="scheduled">定时任务</option>
                <option value="manual">手动生成</option>
                <option value="save-and-generate">保存并生成</option>
              </select></SelectField
            >
          </label>
        </div>
        <VirtualTable
          :items="filteredRuns"
          item-key="id"
          :col-span="6"
          :row-height="58"
          height="520px"
          min-width="780px"
          :has-more="historyHasMore"
          :loading="historyLoadingMore"
          :error="historyLoadError"
          empty-text="没有符合当前筛选条件的工作流记录"
          :load-more="loadMoreHistory"
        >
          <template #columns
            ><col style="width: 8%" />
            <col style="width: 21%" />
            <col style="width: 23%" />
            <col style="width: 17%" />
            <col style="width: 13%" />
            <col style="width: 18%"
          /></template>
          <template #header
            ><tr>
              <th>序号</th>
              <th>工作流名称</th>
              <th>触发时间</th>
              <th>结果</th>
              <th>耗时</th>
              <th>操作</th>
            </tr></template
          >
          <template #row="{ item: run }">
            <tr
              class="workflow-run-row"
              tabindex="0"
              role="link"
              :aria-label="`查看工作流 #${run.id} 详情`"
              @click="router.push(`/admin/workflows/${run.id}`)"
              @keydown.enter.prevent="router.push(`/admin/workflows/${run.id}`)"
              @keydown.space.prevent="router.push(`/admin/workflows/${run.id}`)"
            >
              <td class="task-id">
                <span class="id-trigger">#{{ run.id }}</span>
              </td>
              <td><span class="name-trigger ellipsis">PAC 生成工作流</span></td>
              <td class="date-cell">
                <span class="date-trigger ellipsis">{{
                  dateLabel(run.started_at || run.created_at)
                }}</span>
              </td>
              <td>
                <span class="result-trigger"
                  ><span class="status-pill" :class="run.status"
                    ><AppIcon
                      v-if="run.status === 'running' || run.status === 'pending'"
                      :name="run.status === 'pending' ? 'clock' : 'loader-circle'"
                      :size="13"
                      :class="{ spinning: run.status === 'running' }"
                    />{{ statusLabel(run.status) }}</span
                  ></span
                >
              </td>
              <td class="duration-cell">
                <span class="duration-trigger ellipsis">{{ durationLabel(run) }}</span>
              </td>
              <td class="actions-cell">
                <div v-if="run.status === 'pending'" class="confirm-anchor" @click.stop>
                  <button
                    class="row-action-button cancel-button"
                    type="button"
                    :disabled="cancellingId !== null"
                    aria-label="取消排队"
                    :title="
                      cancellingId === run.id
                        ? '正在取消此工作流，请稍候'
                        : cancellingId !== null
                          ? '另一条工作流正在取消，请稍候'
                          : '取消此条等待中的工作流'
                    "
                    @click.stop="toggleHistoryCancel(run)"
                  >
                    <AppIcon name="x" :size="15" />
                  </button>
                  <div
                    v-if="confirmingHistoryCancelId === run.id"
                    class="confirm-popover cancel-popover"
                    role="group"
                  >
                    <strong>取消这条等待任务？</strong
                    ><span>取消后将不再执行，但保留执行记录。</span>
                    <div>
                      <button
                        type="button"
                        class="confirm-cancel"
                        @click.stop="resetConfirmations()"
                      >
                        返回</button
                      ><button
                        type="button"
                        class="confirm-cancel-action"
                        :disabled="cancellingId === run.id"
                        :title="
                          cancellingId === run.id
                            ? '正在取消此工作流，请稍候'
                            : '确认取消此等待任务'
                        "
                        @click.stop="cancelRun(run, 'history')"
                      >
                        {{ cancellingId === run.id ? "取消中…" : "确认取消" }}
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else-if="run.status !== 'running'" class="confirm-anchor" @click.stop>
                  <button
                    type="button"
                    class="row-action-button delete-run-button"
                    :disabled="deletingId !== null"
                    aria-label="删除执行记录"
                    :title="
                      deletingId === run.id
                        ? '正在删除此记录，请稍候'
                        : deletingId !== null
                          ? '另一条记录正在删除，请稍候'
                          : '删除此工作流执行记录'
                    "
                    @click.stop="toggleHistoryDelete(run)"
                  >
                    <AppIcon name="trash-2" :size="15" />
                  </button>
                  <div
                    v-if="confirmingHistoryDeleteId === run.id"
                    class="confirm-popover"
                    role="group"
                  >
                    <strong>删除这条记录？</strong><span>阶段详情也会一并删除。</span>
                    <div>
                      <button
                        type="button"
                        class="confirm-cancel"
                        @click.stop="resetConfirmations()"
                      >
                        取消</button
                      ><button
                        type="button"
                        class="confirm-delete"
                        :disabled="deletingId === run.id"
                        :title="
                          deletingId === run.id
                            ? '正在删除此记录，请稍候'
                            : '确认删除此工作流执行记录'
                        "
                        @click.stop="deleteRun(run)"
                      >
                        {{ deletingId === run.id ? "删除中…" : "确认删除" }}
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </VirtualTable>
        <p class="panel-footnote">
          已加载 {{ runs.length }} / {{ historyTotal }} 条执行记录；筛选仅作用于已加载记录。
        </p>
      </section>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.workflow-page {
  display: grid;
  gap: 18px;
}
.catalog-item {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}
.catalog-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
  flex: 1;
}
.catalog-copy strong {
  color: var(--text);
  font-size: 14px;
}
.catalog-copy span,
.catalog-copy small {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.read-only-pill {
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.workflow-run-row {
  cursor: pointer;
  outline-offset: -2px;
}
.workflow-run-row:focus-visible {
  outline: 2px solid var(--accent);
}
.workflow-run-row:hover td {
  background: var(--surface-2);
}
.actions-cell {
  width: 104px;
  min-width: 104px;
  text-align: center;
  white-space: nowrap;
}
.actions-cell .confirm-anchor {
  display: inline-block;
}
.ellipsis {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.name-trigger {
  max-width: 150px;
}
.date-trigger {
  max-width: 170px;
}
.duration-trigger {
  max-width: 95px;
}
.result-trigger {
  max-width: 130px;
}
.id-trigger {
  max-width: 65px;
}
.row-action-button {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}
.delete-run-button {
  color: var(--red);
  background: var(--red-soft, var(--surface));
  border-color: color-mix(in srgb, var(--red) 30%, var(--line));
}
.cancel-button {
  color: var(--amber, #b45309);
  background: var(--amber-soft, #fff3dc);
  border-color: color-mix(in srgb, var(--amber, #d97706) 35%, var(--line));
}
.row-action-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.confirm-anchor {
  position: relative;
  display: inline-block;
}
.confirm-popover {
  position: absolute;
  z-index: 20;
  right: 0;
  top: calc(100% + 7px);
  width: 220px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  text-align: left;
}
.confirm-popover strong,
.confirm-popover span {
  display: block;
}
.confirm-popover strong {
  color: var(--text);
  font-size: 12px;
}
.confirm-popover span {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.confirm-popover > div {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 12px;
}
.confirm-popover button {
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
.confirm-popover .confirm-delete {
  background: var(--red);
  border-color: var(--red);
  color: white;
}
.confirm-popover .confirm-cancel-action {
  background: var(--amber-soft, #fff3dc);
  border-color: color-mix(in srgb, var(--amber, #d97706) 40%, var(--line));
  color: var(--amber, #b45309);
}
.cancel-popover {
  border-color: color-mix(in srgb, var(--amber, #d97706) 35%, var(--line));
}
.workflow-button.cancel-button {
  background: var(--amber-soft, #fff3dc);
  border-color: color-mix(in srgb, var(--amber, #d97706) 35%, var(--line));
  color: var(--amber, #b45309);
}
.confirm-popover button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.current-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.workflow-queue .panel-heading {
  margin-bottom: 12px;
}
.history-heading-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.history-disabled-hint {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.workflow-button.history-clear-button {
  color: var(--red);
  background: var(--red-soft, var(--surface));
  border-color: color-mix(in srgb, var(--red) 30%, var(--line));
}
.workflow-button.history-clear-button:hover:not(:disabled) {
  background: var(--red-soft, var(--surface-2));
}
.workflow-button.history-clear-button:disabled {
  opacity: 0.45;
}
.queue-list {
  display: grid;
  gap: 8px;
}
.queue-item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-2);
}
.queue-icon {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--accent);
  background: var(--accent-soft);
}
.queue-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
  flex: 1;
}
.queue-copy > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.queue-copy strong {
  color: var(--text);
  font-size: 12px;
}
.queue-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  .queue-item {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .queue-copy {
    flex-basis: calc(100% - 50px);
  }
}
.delete-run-button:focus-visible,
.workflow-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.status-pill {
  gap: 5px;
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
.history-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: -3px 0 16px;
}
.history-filters label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
}
.history-filters .select-field {
  min-width: 150px;
}
.history-filters .select-field :deep(select) {
  min-width: 150px;
  min-height: 36px;
  padding: 0 34px 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
}
.history-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  color: var(--muted);
  font-size: 12px;
}
.history-pagination div {
  display: flex;
  gap: 8px;
}
.history-pagination button {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.history-pagination button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.panel {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-sm, 0 4px 18px rgba(0, 0, 0, 0.03));
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.panel-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 19px;
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
}
.panel-subtitle {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.workflow-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.workflow-button.secondary {
  background: var(--surface);
}
.workflow-button.primary {
  background: var(--accent);
  color: var(--accent-contrast, white);
  border-color: var(--accent);
}
.workflow-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.status-pill,
.count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.status-pill.running,
.status-pill.pending {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
}
.status-pill.succeeded {
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 35%, var(--line));
}
.status-pill.failed {
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 35%, var(--line));
}
.status-pill.cancelled {
  color: var(--muted);
}
.current-main {
  display: flex;
  align-items: center;
  gap: 12px;
}
.current-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}
.current-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.current-copy strong {
  color: var(--text);
  font-size: 15px;
}
.current-copy span,
.current-message {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.current-message {
  margin: 16px 0;
}
.current-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.current-meta div {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.current-meta span {
  color: var(--muted);
  font-size: 11px;
}
.current-meta strong {
  color: var(--text);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.empty-current {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 28px 10px;
  color: var(--muted);
  text-align: center;
}
.empty-current strong {
  color: var(--text);
  font-size: 14px;
}
.empty-current span {
  max-width: 500px;
  font-size: 12px;
  line-height: 1.6;
}
.empty-current a {
  margin-top: 3px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}
.table-scroll {
  width: 100%;
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;
  table-layout: fixed;
}
thead th:nth-child(1) {
  width: 70px;
}
thead th:nth-child(2) {
  width: 160px;
}
thead th:nth-child(3) {
  width: 190px;
}
thead th:nth-child(4) {
  width: 130px;
}
thead th:nth-child(5) {
  width: 100px;
}
thead th:nth-child(6) {
  width: 125px;
}
thead th:nth-child(6) {
  text-align: center;
}
th {
  padding: 10px 12px;
  color: var(--muted);
  background: var(--surface-2);
  font-size: 10px;
  white-space: nowrap;
}
td {
  padding: 13px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  vertical-align: top;
}
.task-id,
.date-cell,
.duration-cell {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.result-cell {
  min-width: 0;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty-row {
  padding: 30px 12px;
  color: var(--muted);
  text-align: center;
}
.workflow-error-detail {
  margin-top: 16px;
  padding: 13px;
  border: 1px solid color-mix(in srgb, var(--red) 30%, var(--line));
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
}
.workflow-error-detail pre {
  margin: 8px 0 0;
  font: inherit;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.workflow-alert {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 12px;
}
.workflow-alert.error {
  border-color: var(--red);
  color: var(--red);
}
.workflow-alert button {
  justify-self: start;
  color: inherit;
}
.spinning {
  animation: spin 0.9s linear infinite;
}
.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex: 0 0 auto;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
@media (max-width: 700px) {
  .workflow-history .panel-heading {
    flex-wrap: wrap;
  }
  .workflow-history .panel-heading > div:first-child {
    min-width: 0;
  }
  .history-heading-actions {
    width: 100%;
    justify-content: space-between;
  }
  .panel {
    padding: 15px;
  }
  .current-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .panel-heading h2 {
    font-size: 17px;
  }
  .table-scroll {
    margin-inline: -4px;
  }
  table {
    min-width: 680px;
  }
  .name-trigger {
    max-width: 105px;
  }
  .date-trigger {
    max-width: 135px;
  }
  .duration-trigger {
    max-width: 72px;
  }
  .result-trigger {
    max-width: 105px;
  }
  .actions-cell {
    width: 100px;
    min-width: 100px;
  }
}
</style>
