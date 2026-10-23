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
.panel-footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
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
.delete-run-button:focus-visible {
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
.history-filters .app-select {
  min-width: 150px;
  max-width: 100%;
}
.history-filters .app-select :deep(.app-select-trigger) {
  min-width: 0;
  min-height: 40px;
  padding: 9px 12px;
  background: var(--surface-2);
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

.run-detail-content { display: grid; gap: 18px; min-width: 0; }
.run-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.run-detail-grid > div { display: grid; gap: 6px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
.run-detail-grid > div > span:first-child { color: var(--muted); font-size: 11px; }
.run-detail-grid strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.run-detail-error { display: grid; gap: 8px; }
.run-detail-error pre { margin: 0; padding: 12px; border: 1px solid color-mix(in srgb, var(--red) 25%, var(--line)); border-radius: 8px; background: var(--red-soft); color: var(--red); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 var(--font-mono); }
.run-detail-actions { display: flex; justify-content: flex-end; }
@media (max-width: 520px) { .run-detail-grid { grid-template-columns: 1fr; } }
.run-detail-stages { display: grid; gap: 10px; }
.run-detail-stages h3 { margin: 0; font-size: 13px; }
.run-detail-stage { display: grid; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 9px; }
.run-detail-stage-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.run-detail-stage-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--muted); font-size: 11px; }
.run-detail-stage-detail { margin: 0; padding: 10px; background: var(--surface-2); border-radius: 7px; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.6 var(--font-mono); }
.run-detail-state, .run-detail-error-message { margin: 0; color: var(--muted); font-size: 12px; }
.run-detail-error-message { color: var(--red); }
</style>
