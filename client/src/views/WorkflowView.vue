<script setup lang="ts">
import AdminLayout from "@/components/layout/AdminLayout.vue";
import { api, type WorkflowStage } from "@/api/client";
import AppIcon from "@/components/AppIcon.vue";
import AppFooter from "@/components/AppFooter.vue";
import ConfirmPopover from "@/components/ConfirmPopover.vue";
import VirtualTable from "@/components/VirtualTable.vue";
import AppSelect from "@/components/AppSelect.vue";
import { useWorkflowDashboard } from "@/composables/useWorkflowDashboard";
import { ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import { DialogDescription, DialogTitle } from "reka-ui";

const selectedRun = ref<any>(null);
const selectedRunStages = ref<WorkflowStage[]>([]);
const runDetailLoading = ref(false);
const runDetailError = ref("");
const runDetailOpen = ref(false);
async function openRunDetail(run: any): Promise<void> {
  selectedRun.value = run;
  selectedRunStages.value = [];
  runDetailError.value = "";
  runDetailOpen.value = true;
  runDetailLoading.value = true;
  try {
    const detail = await api.workflowDetail(run.id);
    selectedRun.value = detail.run;
    selectedRunStages.value = detail.stages;
  } catch (error) {
    runDetailError.value = error instanceof Error ? error.message : String(error);
  } finally { runDetailLoading.value = false; }
}

const {
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
} = useWorkflowDashboard();
</script>

<template>
  <AdminLayout active="workflow" :title="t('workflow.title')" :subtitle="t('workflow.subtitle')">
    <div class="workflow-page">
      <div v-if="error" class="workflow-alert error" role="alert">
        <strong>{{ t("workflow.loadFailed") }}</strong>
        <span>{{ error }}</span>
        <button type="button" class="app-button app-button--secondary" @click="load()">{{ t("common.retry") }}</button>
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
            ><small>{{ t("workflow.idAndTriggers") }}</small>
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
              <span>{{ stageLabel(current.stage) || t("workflowPage.k21") }}</span>
            </div>
          </div>
          <p class="current-message">
            {{ statusLabel(current.status) }}
          </p>
          <div class="current-meta">
            <div>
              <span>{{ t("workflowPage.k49") }}</span
              ><strong>#{{ current.id }}</strong>
            </div>
            <div>
              <span>{{ t("workflowPage.k50") }}</span
              ><strong>{{ modeLabel(current.mode) }}</strong>
            </div>
            <div>
              <span>{{ t("workflowPage.k51") }}</span
              ><strong>{{ dateLabel(current.started_at || current.created_at) }}</strong>
            </div>
            <div>
              <span>{{ t("workflowPage.k52") }}</span
              ><strong>{{ durationLabel(current) }}</strong>
            </div>
          </div>
          <div class="current-actions">
            <RouterLink class="app-button app-button--secondary" :to="`/admin/workflows/${current.id}`"
              ><AppIcon name="external-link" :size="14" /> {{ t("workflowPage.k53") }}</RouterLink
            >
            <ConfirmPopover
              v-if="current.status === 'pending'"
              :open="confirmingCurrentCancel"
              :title="t('workflowPage.k54')"
              :description="t('workflowPage.k55')"
              :confirm-text="t('workflowPage.k26')"
              :cancel-text="t('workflowPage.k56')"
              :busy-text="t('workflowPage.k25')"
              tone="warning"
              :busy="cancellingId === current.id"
              @update:open="confirmingCurrentCancel = $event"
              @confirm="cancelRun(current, 'current')"
            >
              <template #trigger="{ toggle, open }">
                <button
                  class="app-button app-button--danger-ghost"
                  type="button"
                  :disabled="cancellingId === current.id"
                  :title="
                    cancellingId === current.id ? t('workflowPage.k22') : t('workflowPage.k23')
                  "
                  @click="toggleCurrentCancel(toggle, open)"
                >
                  <AppIcon name="x" :size="14" /> {{ t("workflowPage.k39") }}
                </button>
              </template>
            </ConfirmPopover>
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
          <span class="count-pill">{{
            t("workflowPage.taskCount", { n: otherActiveRuns.length })
          }}</span>
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
              <p>
                {{ stageLabel(run.stage) || t("workflowPage.k0") }}
              </p>
            </div>
            <RouterLink class="app-button app-button--secondary" :to="`/admin/workflows/${run.id}`">{{
              t("workflowPage.k53")
            }}</RouterLink>
            <ConfirmPopover
              v-if="run.status === 'pending'"
              :open="confirmingQueueCancelId === run.id"
              :title="t('workflowPage.k54')"
              :description="t('workflowPage.k55')"
              :confirm-text="t('workflowPage.k26')"
              :cancel-text="t('workflowPage.k56')"
              :busy-text="t('workflowPage.k25')"
              tone="warning"
              :busy="cancellingId === run.id"
              @update:open="confirmingQueueCancelId = $event ? run.id : null"
              @confirm="cancelRun(run, 'queue')"
            >
              <template #trigger="{ toggle, open }">
                <button
                  class="app-button app-button--danger-ghost"
                  type="button"
                  :disabled="cancellingId === run.id"
                  :title="
                    cancellingId === run.id
                      ? t('workflowPage.cancellingQueuedTitle')
                      : t('workflowPage.cancelQueuedTitle')
                  "
                  @click.stop="toggleQueueCancel(toggle, open)"
                >
                  <AppIcon name="x" :size="14" /> {{ t("workflowPage.k39") }}
                </button>
              </template>
            </ConfirmPopover>
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
            <button
              class="app-button app-button--secondary"
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
            <span class="count-pill">{{
              t("workflowPage.matchLoaded", { filtered: filteredRuns.length, loaded: runs.length })
            }}</span>
            <ConfirmPopover
              :open="confirmingHistoryClear"
              :title="t('workflowPage.k30')"
              :description="t('workflowPage.k31')"
              :confirm-text="t('workflowPage.k32')"
              :busy-text="t('workflowPage.k33')"
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
                  class="app-button app-button--danger-ghost"
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
        <p v-if="historyClearDisabledReason" class="history-disabled-hint" aria-live="polite">
          {{ historyClearDisabledReason }}
        </p>
        <div class="history-filters" :aria-label="t('workflowPage.k36')">
          <label
            >{{ t("workflowPage.k64") }}
            <AppSelect
              v-model="selectedStatus"
              :options="[
                { value: 'all', label: t('workflowPage.k65') },
                { value: 'pending', label: t('workflowPage.k0') },
                { value: 'running', label: t('workflowPage.k1') },
                { value: 'succeeded', label: t('workflowPage.k2') },
                { value: 'failed', label: t('workflowPage.k3') },
                { value: 'cancelled', label: t('workflowPage.k4') },
              ]"
            />
          </label>
          <label
            >{{ t("workflowPage.k66") }}
            <AppSelect
              v-model="selectedSource"
              :options="[
                { value: 'all', label: t('workflowPage.k67') },
                { value: 'startup', label: t('workflowPage.k5') },
                { value: 'scheduled', label: t('workflowPage.k6') },
                { value: 'manual', label: t('workflowPage.k7') },
                { value: 'save-and-generate', label: t('workflowPage.k8') },
              ]"
            />
          </label>
        </div>
        <VirtualTable
          :items="filteredRuns"
          item-key="id"
          :col-span="6"
          :row-height="58"
          :height="520"
          min-width="780px"
          :has-more="historyHasMore"
          :loading="historyLoadingMore"
          :error="historyLoadError"
          :empty-text="t('workflowPage.k37')"
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
              :aria-label="t('workflowPage.viewRunDetails', { id: run.id })"
              @click="router.push(`/admin/workflows/${run.id}`)"
              @keydown.enter.prevent="router.push(`/admin/workflows/${run.id}`)"
              @keydown.space.prevent="router.push(`/admin/workflows/${run.id}`)"
            >
              <td class="task-id">
                <span class="id-trigger">#{{ run.id }}</span>
              </td>
              <td>
                <span class="name-trigger ellipsis">{{ t("workflow.pacGeneration") }}</span>
              </td>
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
                <ConfirmPopover
                  v-if="run.status === 'pending'"
                  :open="confirmingHistoryCancelId === run.id"
                  :title="t('workflowPage.k54')"
                  :description="t('workflowPage.k55')"
                  :confirm-text="t('workflowPage.k26')"
                  :cancel-text="t('workflowPage.k56')"
                  :busy-text="t('workflowPage.k25')"
                  tone="warning"
                  :busy="cancellingId === run.id"
                  @update:open="confirmingHistoryCancelId = $event ? run.id : null"
                  @confirm="cancelRun(run, 'history')"
                >
                  <template #trigger="{ toggle, open }">
                    <button
                      class="app-button app-button--sm app-button--danger-ghost"
                      type="button"
                      :disabled="cancellingId !== null"
                      :aria-label="t('workflowPage.k39')"
                      :title="
                        cancellingId === run.id
                          ? t('workflowPage.k28')
                          : cancellingId !== null
                            ? t('workflowPage.k40')
                            : t('workflowPage.k41')
                      "
                      @click.stop="toggleHistoryCancel(toggle, open)"
                    >
                      <AppIcon name="x" :size="15" />
                    </button>
                  </template>
                </ConfirmPopover>
                <ConfirmPopover
                  v-else-if="run.status !== 'running'"
                  :open="confirmingHistoryDeleteId === run.id"
                  :title="t('workflowPage.k74')"
                  :description="t('workflowPage.k75')"
                  :confirm-text="t('workflowPage.k48')"
                  :cancel-text="t('workflowPage.k76')"
                  :busy-text="t('workflowPage.k47')"
                  :busy="deletingId === run.id"
                  @update:open="confirmingHistoryDeleteId = $event ? run.id : null"
                  @confirm="deleteRun(run)"
                >
                  <template #trigger="{ toggle, open }">
                    <button
                      type="button"
                      class="app-button app-button--sm app-button--danger-ghost"
                      :disabled="deletingId !== null"
                      :aria-label="t('workflowPage.k42')"
                      :title="
                        deletingId === run.id
                          ? t('workflowPage.k43')
                          : deletingId !== null
                            ? t('workflowPage.k44')
                            : t('workflowPage.k45')
                      "
                      @click.stop="toggleHistoryDelete(toggle, open)"
                    >
                      <AppIcon name="trash-2" :size="15" />
                    </button>
                  </template>
                </ConfirmPopover>
              </td>
            </tr>
          </template>
        </VirtualTable>
        <p class="panel-footnote">
          {{ t("workflowPage.loadedHint", { loaded: runs.length, total: historyTotal }) }}
        </p>
      </section>
      <AppDialog :open="runDetailOpen && !!selectedRun" :label="t('workflowPage.viewRunDetails', { id: selectedRun?.id })" width="min(720px, calc(100vw - 16px))" @update:open="runDetailOpen = $event">
        <template #header>
          <div>
            <p class="eyebrow">WORKFLOW RUN #{{ selectedRun?.id }}</p>
            <DialogTitle>{{ t("workflow.pacGeneration") }}</DialogTitle>
            <DialogDescription>{{ t("workflowPage.viewRunDetails", { id: selectedRun?.id }) }}</DialogDescription>
          </div>
        </template>
        <template #body>
          <div v-if="selectedRun" class="run-detail-content">
            <div class="run-detail-grid">
              <div><span>{{ t("workflowPage.k69") }}</span><strong>{{ sourceLabel(selectedRun.source) }}</strong></div>
              <div><span>{{ t("workflowPage.k71") }}</span><strong><span class="status-pill" :class="selectedRun.status">{{ statusLabel(selectedRun.status) }}</span></strong></div>
              <div><span>{{ t("workflowPage.k70") }}</span><strong>{{ dateLabel(selectedRun.started_at || selectedRun.created_at) }}</strong></div>
              <div><span>{{ t("workflowPage.k72") }}</span><strong>{{ durationLabel(selectedRun) }}</strong></div>
              <div><span>{{ t("workflowPage.k50") }}</span><strong>{{ modeLabel(selectedRun.mode) }}</strong></div>
              <div><span>{{ t("workflowPage.k61") }}</span><strong>{{ stageLabel(selectedRun.stage) || "—" }}</strong></div>
              <div><span>{{ t("workflowPage.k75") }}</span><strong>{{ selectedRun.finished_at ? dateLabel(selectedRun.finished_at) : "—" }}</strong></div>
            </div>
            <p v-if="runDetailLoading" class="run-detail-state">{{ t("common.loading") }}</p>
            <p v-if="runDetailError" class="run-detail-error-message" role="alert">{{ runDetailError }}</p>
            <section v-if="selectedRunStages.length" class="run-detail-stages">
              <h3>{{ t("workflowPage.k61") }}</h3>
              <article v-for="stage in selectedRunStages" :key="stage.id" class="run-detail-stage">
                <div class="run-detail-stage-heading"><strong>{{ stageLabel(stage.stage_key) }}</strong><span class="status-pill" :class="stage.status">{{ statusLabel(stage.status) }}</span></div>
                <div class="run-detail-stage-meta"><span>{{ stage.started_at ? dateLabel(stage.started_at) : "—" }}</span><span>{{ stage.finished_at ? dateLabel(stage.finished_at) : "—" }}</span><span>{{ stage.duration_ms == null ? "—" : stage.duration_ms + " ms" }}</span></div>
                <pre v-if="stage.error" class="run-detail-error">{{ stage.error }}</pre>
                <pre v-if="stage.detail" class="run-detail-stage-detail">{{ JSON.stringify(stage.detail, null, 2) }}</pre>
              </article>
            </section>
            <div v-if="selectedRun.error" class="run-detail-error"><strong>{{ t("workflowPage.k57") }}</strong><pre>{{ selectedRun.error }}</pre></div>
            <div class="run-detail-actions"><RouterLink class="app-button app-button--secondary" :to="`/admin/workflows/${selectedRun.id}`" @click="runDetailOpen = false"><AppIcon name="external-link" :size="14" />{{ t("workflowPage.k53") }}</RouterLink></div>
          </div>
        </template>
      </AppDialog>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.workflow-page {
  @apply grid gap-[18px];
}
.catalog-item {
  @apply flex items-center gap-[13px] rounded-[10px] border p-3.5;
  border-color: var(--line);
  background: var(--surface-2);
}
.catalog-copy {
  @apply grid min-w-0 flex-1 gap-[5px];
}
.catalog-copy strong {
  @apply text-sm;
  color: var(--text);
}
.catalog-copy span,
.catalog-copy small {
  @apply text-xs leading-normal;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.read-only-pill {
  @apply whitespace-nowrap rounded-full border px-2 py-1 text-[11px];
  border-color: var(--line);
  color: var(--muted);
}
.panel-footnote {
  @apply mb-0 mt-3 text-xs leading-normal;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.workflow-run-row {
  @apply cursor-pointer;
  outline-offset: -2px;
}
.workflow-run-row:focus-visible {
  outline: 2px solid var(--accent);
}
.workflow-run-row:hover td {
  background: var(--surface-2);
}
.actions-cell {
  @apply w-[104px] min-w-[104px] whitespace-nowrap text-center;
}
.ellipsis {
  @apply block overflow-hidden text-ellipsis whitespace-nowrap;
}
.name-trigger {
  @apply max-w-[150px];
}
.date-trigger {
  @apply max-w-[170px];
}
.duration-trigger {
  @apply max-w-[95px];
}
.result-trigger {
  @apply max-w-[130px];
}
.id-trigger {
  @apply max-w-[65px];
}
.current-actions {
  @apply mt-4 flex flex-wrap gap-2;
}
.workflow-queue .panel-heading {
  @apply mb-3;
}
.history-heading-actions {
  @apply flex min-w-0 flex-wrap items-center justify-end gap-2;
}
.history-disabled-hint {
  @apply mb-0 mt-2 text-[11px] leading-snug;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.queue-list {
  @apply grid gap-2;
}
.queue-item {
  @apply flex min-w-0 items-center gap-[11px] rounded-[9px] border p-[11px];
  border-color: var(--line);
  background: var(--surface-2);
}
.queue-icon {
  @apply grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px];
  color: var(--accent);
  background: var(--accent-soft);
}
.queue-copy {
  @apply grid min-w-0 flex-1 gap-[5px];
}
.queue-copy > div {
  @apply flex flex-wrap items-center gap-2;
}
.queue-copy strong {
  @apply text-xs;
  color: var(--text);
}
.queue-copy p {
  @apply m-0 text-[11px];
  color: var(--muted);
  overflow-wrap: anywhere;
}
@media (max-width: 700px) {
  .queue-item {
    @apply flex-wrap items-start;
  }
  .queue-copy {
    flex-basis: calc(100% - 50px);
  }
}
.delete-run-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.status-pill {
  @apply gap-[5px];
}
@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
.history-filters {
  @apply my-0 mb-4 flex flex-wrap gap-3;
  margin-top: -3px;
}
.history-filters label {
  @apply grid gap-1.5 text-[11px];
  color: var(--muted);
}
.history-filters .app-select {
  @apply min-w-[150px] max-w-full;
}
.history-filters .app-select :deep(.app-select-trigger) {
  @apply min-w-0 px-3 py-[9px];
  min-height: 40px;
  background: var(--surface-2);
}
.history-pagination {
  @apply mt-4 flex items-center justify-between gap-3 text-xs;
  color: var(--muted);
}
.history-pagination div {
  @apply flex gap-2;
}
.history-pagination button {
  @apply min-h-[34px] cursor-pointer rounded-[7px] border px-[11px];
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--text);
}
.history-pagination button:disabled {
  @apply cursor-not-allowed opacity-45;
}
.panel {
  @apply min-w-0 rounded-[14px] border p-[22px];
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm, 0 4px 18px rgba(0, 0, 0, 0.03));
}
.panel-heading {
  @apply mb-[18px] flex items-start justify-between gap-4;
}
.panel-heading h2 {
  @apply m-0 text-[19px];
  color: var(--text);
}
.eyebrow {
  @apply mb-1.5 mt-0 text-[10px] font-extrabold tracking-[0.13em];
  color: var(--muted);
}
.panel-subtitle {
  @apply mb-0 mt-[7px] text-xs;
  color: var(--muted);
}
.status-pill,
.count-pill {
  @apply inline-flex items-center justify-center whitespace-nowrap rounded-full border px-[9px] py-[5px] text-[11px] font-extrabold;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
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
  @apply flex items-center gap-3;
}
.current-icon {
  @apply grid h-[46px] w-[46px] place-items-center rounded-xl;
  background: var(--accent-soft);
  color: var(--accent);
}
.current-copy {
  @apply grid min-w-0 gap-[5px];
}
.current-copy strong {
  @apply text-[15px];
  color: var(--text);
}
.current-copy span,
.current-message {
  @apply text-xs;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.current-message {
  @apply my-4;
}
.current-meta {
  @apply grid grid-cols-4 gap-3 border-t pt-4;
  border-color: var(--line);
}
.current-meta div {
  @apply grid min-w-0 gap-1.5;
}
.current-meta span {
  @apply text-[11px];
  color: var(--muted);
}
.current-meta strong {
  @apply text-xs;
  color: var(--text);
  overflow-wrap: anywhere;
}
.empty-current {
  @apply grid justify-items-center gap-2.5 px-2.5 py-7 text-center;
  color: var(--muted);
}
.empty-current strong {
  @apply text-sm;
  color: var(--text);
}
.empty-current span {
  @apply max-w-[500px] text-xs leading-normal;
}
.empty-current a {
  @apply mt-[3px] text-xs font-bold;
  color: var(--accent);
}
table {
  @apply w-full border-collapse text-left text-xs;
  min-width: 720px;
  table-layout: fixed;
}
thead th:nth-child(1) {
  @apply w-[70px];
}
thead th:nth-child(2) {
  @apply w-[160px];
}
thead th:nth-child(3) {
  @apply w-[190px];
}
thead th:nth-child(4) {
  @apply w-[130px];
}
thead th:nth-child(5) {
  @apply w-[100px];
}
thead th:nth-child(6) {
  @apply w-[125px] text-center;
}
th {
  @apply whitespace-nowrap px-3 py-2.5 text-[10px];
  color: var(--muted);
  background: var(--surface-2);
}
td {
  @apply border-b px-3 py-[13px] align-top;
  border-color: var(--line);
  color: var(--text);
}
.task-id,
.date-cell,
.duration-cell {
  @apply whitespace-nowrap tabular-nums;
}
.result-cell {
  @apply min-w-0 max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap;
}
.empty-row {
  @apply px-3 py-[30px] text-center;
  color: var(--muted);
}
.workflow-error-detail {
  @apply mt-4 rounded-lg border p-[13px];
  border-color: color-mix(in srgb, var(--red) 30%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
.workflow-error-detail pre {
  @apply mb-0 mt-2 text-xs whitespace-pre-wrap;
  overflow-wrap: anywhere;
}
.workflow-alert {
  @apply grid gap-1.5 rounded-[10px] border p-3.5 text-xs;
  border-color: var(--line);
}
.workflow-alert.error {
  border-color: var(--red);
  color: var(--red);
}
.workflow-alert button {
  @apply justify-self-start;
  color: inherit;
}
.spinning {
  animation: spin 0.9s linear infinite;
}
.spinner {
  @apply h-[22px] w-[22px] shrink-0 animate-[spin_0.8s_linear_infinite] rounded-full border-2;
  border-color: var(--line);
  border-top-color: var(--accent);
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
    @apply flex-wrap;
  }
  .workflow-history .panel-heading > div:first-child {
    @apply min-w-0;
  }
  .history-heading-actions {
    @apply w-full justify-between;
  }
  .panel {
    @apply p-[15px];
  }
  .current-meta {
    @apply grid-cols-2;
  }
  .panel-heading h2 {
    @apply text-[17px];
  }
  table {
    min-width: 680px;
  }
  .name-trigger {
    @apply max-w-[105px];
  }
  .date-trigger {
    @apply max-w-[135px];
  }
  .duration-trigger {
    @apply max-w-[72px];
  }
  .result-trigger {
    @apply max-w-[105px];
  }
  .actions-cell {
    @apply w-[100px] min-w-[100px];
  }
}
.run-detail-content {
  @apply grid min-w-0 gap-[18px];
}
.run-detail-grid {
  @apply grid grid-cols-2 gap-3;
}
.run-detail-grid > div {
  @apply grid min-w-0 gap-1.5 rounded-[9px] border p-3;
  border-color: var(--line);
  background: var(--surface-2);
}
.run-detail-grid > div > span:first-child {
  @apply text-[11px];
  color: var(--muted);
}
.run-detail-grid strong {
  @apply min-w-0 text-[13px];
  overflow-wrap: anywhere;
}
.run-detail-error {
  @apply grid gap-2;
}
.run-detail-error pre {
  @apply m-0 rounded-lg border p-3 font-mono text-xs leading-normal whitespace-pre-wrap;
  border-color: color-mix(in srgb, var(--red) 25%, var(--line));
  background: var(--red-soft);
  color: var(--red);
  overflow-wrap: anywhere;
}
.run-detail-actions {
  @apply flex justify-end;
}
@media (max-width: 520px) {
  .run-detail-grid {
    @apply grid-cols-1;
  }
}
.run-detail-stages {
  @apply grid gap-2.5;
}
.run-detail-stages h3 {
  @apply m-0 text-[13px];
}
.run-detail-stage {
  @apply grid min-w-0 gap-2 rounded-[9px] border p-3;
  border-color: var(--line);
}
.run-detail-stage-heading {
  @apply flex items-center justify-between gap-2.5;
}
.run-detail-stage-meta {
  @apply flex flex-wrap gap-x-3.5 gap-y-2 text-[11px];
  color: var(--muted);
}
.run-detail-stage-detail {
  @apply m-0 rounded-[7px] p-2.5 font-mono text-[11px] leading-normal whitespace-pre-wrap;
  background: var(--surface-2);
  overflow-wrap: anywhere;
}
.run-detail-state,
.run-detail-error-message {
  @apply m-0 text-xs;
  color: var(--muted);
}
.run-detail-error-message {
  color: var(--red);
}
</style>
