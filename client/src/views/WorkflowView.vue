<script setup lang="ts">
import { useI18n } from "vue-i18n";
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
const { t } = useI18n();

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
  pending: t("workflowPage.k0"),
  running: t("workflowPage.k1"),
  succeeded: t("workflowPage.k2"),
  failed: t("workflowPage.k3"),
  cancelled: t("workflowPage.k4"),
};
const sourceNames: Record<string, string> = {
  startup: t("workflowPage.k5"),
  scheduled: t("workflowPage.k6"),
  manual: t("workflowPage.k7"),
  "save-and-generate": t("workflowPage.k8"),
};
const statusLabel = (status: string) => statusNames[status] ?? status;
const sourceLabel = (source: string) => sourceNames[source] ?? source;
const modeLabel = (mode: string) =>
  mode === "remote" ? t("workflowPage.k9") : mode === "custom" ? t("workflowPage.k10") : mode || "—";
const durationLabel = (run: WorkflowRun) => {
  const ms =
    run.duration_ms ?? (run.started_at ? Date.now() - new Date(run.started_at).getTime() : null);
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return t("workflowPage.sec", { n: (ms / 1000).toFixed(1) });
  return t("workflowPage.minSec", { m: Math.floor(ms / 60000), s: Math.floor((ms % 60000) / 1000) });
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
              ? t("workflowPage.runCompleted", { id: run.id })
              : run.status === "failed"
                ? t("workflowPage.runFailed", { id: run.id, detail: run.error || run.message || t("workflowPage.k11") })
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
</script>

<template>
  <AdminLayout
    active="workflow"
    :title="t('workflow.title')"
    :subtitle="t('workflow.subtitle')"
  >
    <template #actions>
      <button
        class="workflow-button secondary"
        type="button"
        :disabled="refreshing"
        :title="refreshing ? t('workflow.refreshingTitle') : t('workflow.refreshTitle')"
        @click="load()"
      >
        <AppIcon
          :name="refreshing ? 'loader-circle' : 'refresh-cw'"
          :size="15"
          :class="{ spinning: refreshing }"
        />
        {{ refreshing ? t("common.refreshing") : t("common.refresh") }}
      </button>
      <RouterLink class="workflow-button primary" to="/admin/settings">{{ t("workflow.configSettings") }}</RouterLink>
    </template>

    <div class="workflow-page">
      <div v-if="error" class="workflow-alert error" role="alert">
        <strong>{{ t("workflow.loadFailed") }}</strong>
        <span>{{ error }}</span>
        <button type="button" @click="load()">{{ t("common.retry") }}</button>
      </div>

      <section class="workflow-current panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">WORKFLOW CATALOG</p>
            <h2>{{ t("workflow.definition") }}</h2>
            <p class="panel-subtitle">{{ t("workflow.definitionDesc") }}</p>
          </div>
          <span class="count-pill">{{ t("workflow.countOne") }}</span>
        </div>
        <div class="catalog-item">
          <div class="current-icon"><AppIcon name="workflow" :size="22" /></div>
          <div class="catalog-copy">
            <strong>{{ t("workflow.pacGeneration") }}</strong
            ><span>{{ t("workflow.pacGenerationDesc") }}</span
            ><small
              >{{ t("workflow.idAndTriggers") }}</small
            >
          </div>
          <span class="read-only-pill">{{ t("workflow.readOnly") }}</span>
        </div>
      </section>

      <section class="workflow-current panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">CURRENT TASK</p>
            <h2>{{ t("workflow.current") }}</h2>
          </div>
          <span class="status-pill" :class="active ? current!.status : 'idle'"
            ><AppIcon
              v-if="active && (current!.status === 'running' || current!.status === 'pending')"
              :name="current!.status === 'pending' ? 'clock' : 'loader-circle'"
              :size="13"
              :class="{ spinning: current!.status === 'running' }"
            />{{ active ? statusLabel(current!.status) : t("workflowPage.k20") }}</span
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
              <span>{{ current.stage || t("workflowPage.k21") }}</span>
            </div>
          </div>
          <p class="current-message">{{ current.message }}</p>
          <div class="current-meta">
            <div>
              <span>{{ t("workflowPage.k49") }}</span><strong>#{{ current.id }}</strong>
            </div>
            <div>
              <span>{{ t("workflowPage.k50") }}</span><strong>{{ modeLabel(current.mode) }}</strong>
            </div>
            <div>
              <span>{{ t("workflowPage.k51") }}</span
              ><strong>{{ dateLabel(current.started_at || current.created_at) }}</strong>
            </div>
            <div>
              <span>{{ t("workflowPage.k52") }}</span><strong>{{ durationLabel(current) }}</strong>
            </div>
          </div>
          <div class="current-actions">
            <RouterLink class="workflow-button secondary" :to="`/admin/workflows/${current.id}`"
              ><AppIcon name="external-link" :size="14" /> {{ t("workflowPage.k53") }}</RouterLink
            >
            <div v-if="current.status === 'pending'" class="confirm-anchor">
              <button
                class="workflow-button cancel-button"
                type="button"
                :disabled="cancellingId === current.id"
                :title="
                  cancellingId === current.id
                    ? t('workflowPage.k22')
                    : t('workflowPage.k23')
                "
                @click="toggleCurrentCancel()"
              >
                <AppIcon name="x" :size="14" /> {{ t("workflowPage.k39") }}
              </button>
              <div
                v-if="confirmingCurrentCancel"
                class="confirm-popover cancel-popover"
                role="group"
              >
                <strong>{{ t("workflowPage.k54") }}</strong><span>{{ t("workflowPage.k55") }}</span>
                <div>
                  <button type="button" class="confirm-cancel" @click.stop="resetConfirmations()">
                    {{ t("workflowPage.k56") }}</button
                  ><button
                    type="button"
                    class="confirm-cancel-action"
                    :disabled="cancellingId === current.id"
                    :title="
                      cancellingId === current.id
                        ? t('workflowPage.k22')
                        : t('workflowPage.k24')
                    "
                    @click="cancelRun(current, 'current')"
                  >
                    {{ cancellingId === current.id ? t("workflowPage.k25") : t("workflowPage.k26") }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="current.error" class="workflow-error-detail">
            <strong>{{ t("workflowPage.k57") }}</strong>
            <pre>{{ current.error }}</pre>
          </div>
        </template>
        <div v-else class="empty-current">
          <template v-if="loading">
            <span class="spinner" aria-hidden="true"></span>
            <strong>{{ t("workflowPage.k58") }}</strong>
          </template>
          <template v-else>
            <AppIcon name="check-circle-2" :size="26" />
            <strong>{{ t("workflowPage.k59") }}</strong>
          </template>
        </div>
      </section>

      <section v-if="otherActiveRuns.length" class="workflow-queue panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">ACTIVE QUEUE</p>
            <h2>{{ t("workflowPage.k60") }}</h2>
            <p class="panel-subtitle">{{ t("workflowPage.k61") }}</p>
          </div>
          <span class="count-pill">{{ t("workflowPage.taskCount", { n: otherActiveRuns.length }) }}</span>
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
              <p>{{ run.stage || run.message || t("workflowPage.k0") }}</p>
            </div>
            <RouterLink class="workflow-button secondary" :to="`/admin/workflows/${run.id}`"
              >{{ t("workflowPage.k53") }}</RouterLink
            >
            <div v-if="run.status === 'pending'" class="confirm-anchor">
              <button
                class="workflow-button cancel-button"
                type="button"
                :disabled="cancellingId === run.id"
                :title='t("workflowPage.k27")'
                @click.stop="toggleQueueCancel(run)"
              >
                <AppIcon name="x" :size="14" /> {{ t("workflowPage.k39") }}
              </button>
              <div
                v-if="confirmingQueueCancelId === run.id"
                class="confirm-popover cancel-popover"
                role="group"
              >
                <strong>{{ t("workflowPage.k54") }}</strong><span>{{ t("workflowPage.k55") }}</span>
                <div>
                  <button type="button" class="confirm-cancel" @click.stop="resetConfirmations()">
                    {{ t("workflowPage.k56") }}</button
                  ><button
                    type="button"
                    class="confirm-cancel-action"
                    :disabled="cancellingId === run.id"
                    :title="
                      cancellingId === run.id ? t('workflowPage.k28') : t('workflowPage.k29')
                    "
                    @click.stop="cancelRun(run, 'queue')"
                  >
                    {{ cancellingId === run.id ? t("workflowPage.k25") : t("workflowPage.k26") }}
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
            <h2>{{ t("workflowPage.k62") }}</h2>
            <p v-if="activeRuns.length" class="panel-subtitle">
              {{ t("workflowPage.k63") }}
            </p>
          </div>
          <div class="history-heading-actions">
            <span class="count-pill"
              >{{ t("workflowPage.matchLoaded", { filtered: filteredRuns.length, loaded: runs.length }) }}</span
            >
            <ConfirmPopover
              :open="confirmingHistoryClear"
              :title='t("workflowPage.k30")'
              :description='t("workflowPage.k31")'
              :confirm-text='t("workflowPage.k32")'
              :busy-text='t("workflowPage.k33")'
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
                  {{ clearingHistory ? t("workflowPage.k33") : t("workflowPage.k34") }}
                </button></template
              >
            </ConfirmPopover>
          </div>
        </div>
        <p
          v-if="historyClearDisabledReason"
          class="history-disabled-hint"
          aria-live="polite"
        >
          {{ historyClearDisabledReason }}
        </p>
        <div class="history-filters" :aria-label='t("workflowPage.k36")'>
          <label
            >{{ t("workflowPage.k64") }}
            <SelectField
              ><select v-model="selectedStatus">
                <option value="all">{{ t("workflowPage.k65") }}</option>
                <option value="pending">{{ t("workflowPage.k0") }}</option>
                <option value="running">{{ t("workflowPage.k1") }}</option>
                <option value="succeeded">{{ t("workflowPage.k2") }}</option>
                <option value="failed">{{ t("workflowPage.k3") }}</option>
                <option value="cancelled">{{ t("workflowPage.k4") }}</option>
              </select></SelectField
            >
          </label>
          <label
            >{{ t("workflowPage.k66") }}
            <SelectField
              ><select v-model="selectedSource">
                <option value="all">{{ t("workflowPage.k67") }}</option>
                <option value="startup">{{ t("workflowPage.k5") }}</option>
                <option value="scheduled">{{ t("workflowPage.k6") }}</option>
                <option value="manual">{{ t("workflowPage.k7") }}</option>
                <option value="save-and-generate">{{ t("workflowPage.k8") }}</option>
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
          :empty-text='t("workflowPage.k37")'
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
              <th>{{ t("workflowPage.k68") }}</th>
              <th>{{ t("workflowPage.k69") }}</th>
              <th>{{ t("workflowPage.k70") }}</th>
              <th>{{ t("workflowPage.k71") }}</th>
              <th>{{ t("workflowPage.k72") }}</th>
              <th>{{ t("workflowPage.k73") }}</th>
            </tr></template
          >
          <template #row="{ item: run }">
            <tr
              class="workflow-run-row"
              tabindex="0"
              role="link"
              :aria-label='t("workflowPage.k38")'
              @click="router.push(`/admin/workflows/${run.id}`)"
              @keydown.enter.prevent="router.push(`/admin/workflows/${run.id}`)"
              @keydown.space.prevent="router.push(`/admin/workflows/${run.id}`)"
            >
              <td class="task-id">
                <span class="id-trigger">#{{ run.id }}</span>
              </td>
              <td><span class="name-trigger ellipsis">{{ t("workflow.pacGeneration") }}</span></td>
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
                    :aria-label='t("workflowPage.k39")'
                    :title="
                      cancellingId === run.id
                        ? t('workflowPage.k28')
                        : cancellingId !== null
                          ? t('workflowPage.k40')
                          : t('workflowPage.k41')
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
                    <strong>{{ t("workflowPage.k54") }}</strong
                    ><span>{{ t("workflowPage.k55") }}</span>
                    <div>
                      <button
                        type="button"
                        class="confirm-cancel"
                        @click.stop="resetConfirmations()"
                      >
                        {{ t("workflowPage.k56") }}</button
                      ><button
                        type="button"
                        class="confirm-cancel-action"
                        :disabled="cancellingId === run.id"
                        :title="
                          cancellingId === run.id
                            ? t('workflowPage.k28')
                            : t('workflowPage.k29')
                        "
                        @click.stop="cancelRun(run, 'history')"
                      >
                        {{ cancellingId === run.id ? t("workflowPage.k25") : t("workflowPage.k26") }}
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else-if="run.status !== 'running'" class="confirm-anchor" @click.stop>
                  <button
                    type="button"
                    class="row-action-button delete-run-button"
                    :disabled="deletingId !== null"
                    :aria-label='t("workflowPage.k42")'
                    :title="
                      deletingId === run.id
                        ? t('workflowPage.k43')
                        : deletingId !== null
                          ? t('workflowPage.k44')
                          : t('workflowPage.k45')
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
                    <strong>{{ t("workflowPage.k74") }}</strong><span>{{ t("workflowPage.k75") }}</span>
                    <div>
                      <button
                        type="button"
                        class="confirm-cancel"
                        @click.stop="resetConfirmations()"
                      >
                        {{ t("workflowPage.k76") }}</button
                      ><button
                        type="button"
                        class="confirm-delete"
                        :disabled="deletingId === run.id"
                        :title="
                          deletingId === run.id
                            ? t('workflowPage.k43')
                            : t('workflowPage.k46')
                        "
                        @click.stop="deleteRun(run)"
                      >
                        {{ deletingId === run.id ? t("workflowPage.k47") : t("workflowPage.k48") }}
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </VirtualTable>
        <p class="panel-footnote">
          {{ t("workflowPage.loadedHint", { loaded: runs.length, total: historyTotal }) }}
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
