<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  api,
  type AdminSession,
  type AppSettings,
  type GenerationLog,
  type PacPilotProbe,
  type MonitorSummary,
  type PacStatus,
  type WorkflowRun,
} from "@/api/client";

import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppFooter from "@/components/AppFooter.vue";
import ResponsiveTrendChart from "@/components/ResponsiveTrendChart.vue";
import GenerationLogTable from "@/components/GenerationLogTable.vue";

const { t, locale } = useI18n();
const router = useRouter();
const loading = ref(true);
const refreshing = ref(false);
const generating = ref(false);
const error = ref("");
const noticeWorkflowId = ref<number | null>(null);
const notice = computed(() =>
  noticeWorkflowId.value === null
    ? ""
    : t("dashboard.workflowStarted", { id: noticeWorkflowId.value })
);
const noticeOkay = ref(true);
const settings = ref<AppSettings | null>(null);
const status = ref<PacStatus | null>(null);
const logs = ref<GenerationLog[]>([]);
const monitor = ref<MonitorSummary | null>(null);
const engine = ref<PacPilotProbe | null>(null);
const currentWorkflow = ref<WorkflowRun | null>(null);

const modeLabel = computed(() =>
  settings.value?.mode === "remote"
    ? t("dashboard.remoteRuleList")
    : t("dashboard.customRulesLabel")
);
const customRuleCount = computed(
  () => (settings.value?.directList.length ?? 0) + (settings.value?.blockList.length ?? 0)
);
const latestLog = computed(() => logs.value[0] ?? null);

function formatStatusDate(value: string | undefined): string {
  if (!value) return t("common.noRecords");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN", {
    timeZone: settings.value?.timezone,
  });
}

async function loadOverview(): Promise<void> {
  loading.value = !settings.value;
  refreshing.value = true;
  error.value = "";
  try {
    const nextSession: AdminSession = await api.session();
    if (!nextSession.loggedIn) {
      await router.replace("/admin/login");
      return;
    }

    const [nextSettings, nextStatus, nextLogs, nextMonitor, nextEngine, nextWorkflows] =
      await Promise.all([
        api.settings(),
        api.status(),
        api.logsPage(30, 0),
        api.monitorSummary().catch(() => null),
        api.pacpilotStatus().catch(() => null),
        api.workflows(6).catch(() => null),
      ]);
    settings.value = nextSettings;
    status.value = nextStatus;
    logs.value = nextLogs.items;
    monitor.value = nextMonitor;
    engine.value = nextEngine;
    currentWorkflow.value = nextWorkflows?.current ?? null;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
async function generateNow(): Promise<void> {
  if (generating.value) return;
  generating.value = true;
  noticeWorkflowId.value = null;
  error.value = "";
  try {
    const result = await api.generate();
    noticeOkay.value = true;
    noticeWorkflowId.value = result.workflowId;
    await loadOverview();
  } catch (caught) {
    noticeOkay.value = false;
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    generating.value = false;
  }
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <AdminLayout active="dashboard" :title="t('dashboard.title')" :subtitle="t('dashboard.subtitle')">
    <div class="dashboard-view">
      <section v-if="loading && !settings" class="dash-loading" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <strong>{{ t("dashboard.loadingTitle") }}</strong>
          <p>{{ t("dashboard.loadingDesc") }}</p>
        </div>
      </section>

      <div class="dashboard-toolbar">
        <div class="toolbar-copy">
          <h2>{{ t("dashboard.quickActions") }}</h2>
          <p>{{ t("dashboard.toolbarHint") }}</p>
        </div>
        <div class="toolbar-actions">
          <button
            type="button"
            class="app-button app-button--secondary"
            :class="{ 'is-loading': refreshing }"
            :disabled="refreshing"
            :title="refreshing ? t('dashboard.refreshingTitle') : t('dashboard.refreshTitle')"
            @click="loadOverview"
          >
            <AppIcon
              :name="refreshing ? 'loader-circle' : 'refresh-cw'"
              :class="{ 'icon-spinning': refreshing }"
              :size="15"
            />
            {{ refreshing ? t("common.refreshing") : t("common.refresh") }}
          </button>
          <button
            type="button"
            class="app-button app-button--primary"
            :class="{ 'is-loading': generating || loading }"
            :disabled="generating || loading"
            :title="
              loading
                ? t('dashboard.readingStatus')
                : generating
                  ? t('dashboard.generatingStart')
                  : t('dashboard.generateNow')
            "
            @click="generateNow"
          >
            <AppIcon
              :name="generating || loading ? 'loader-circle' : 'zap'"
              :class="{ 'icon-spinning': generating || loading }"
              :size="16"
            />
            {{
              generating
                ? t("common.generating")
                : loading
                  ? t("common.reading")
                  : t("dashboard.generatePac")
            }}
          </button>
        </div>
      </div>

      <div v-if="error" class="dashboard-alert is-error" role="alert">
        <strong>{{ t("dashboard.loadFailed") }}</strong
        ><span>{{ error }}</span>
        <button type="button" class="dashboard-alert-action" @click="loadOverview">
          {{ t("dashboard.reload") }}
        </button>
      </div>
      <div
        v-if="notice"
        class="dashboard-alert"
        :class="noticeOkay ? 'is-success' : 'is-error'"
        role="status"
      >
        {{ notice }}
      </div>
      <RouterLink
        v-if="currentWorkflow"
        to="/admin/workflows"
        class="dashboard-alert workflow-running"
      >
        <AppIcon name="workflow" :size="18" />
        <span
          ><strong>{{
            t("dashboard.workflowRunning", {
              stage: t(`workflow.stageNames.${currentWorkflow.stage}`),
            })
          }}</strong
          ><small>{{ t("dashboard.clickLiveProgress") }}</small></span
        >
      </RouterLink>
      <section class="overview-metrics" :aria-label="t('dashboard.keyStatus')">
        <RouterLink class="overview-metric" to="/">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.pacStatus") }}</span
            ><span class="metric-icon is-file"
              ><AppIcon name="file-check" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value" :class="status?.hasPac ? 'value-good' : 'value-warning'">{{
            loading
              ? t("common.reading")
              : status?.hasPac
                ? t("common.available")
                : t("common.notYetGenerated")
          }}</strong>
          <span class="metric-note">{{
            status?.hasPac ? t("dashboard.pacReadyNote") : t("dashboard.pacMissingNote")
          }}</span>
        </RouterLink>
        <RouterLink class="overview-metric" to="/admin/settings#mode">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.currentMode") }}</span
            ><span class="metric-icon is-route"
              ><AppIcon name="route" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value">{{ loading ? t("common.reading") : modeLabel }}</strong>
          <span class="metric-note">{{
            settings?.mode === "remote"
              ? t("dashboard.modeRemoteHint")
              : t("dashboard.modeCustomHint")
          }}</span>
        </RouterLink>
        <RouterLink class="overview-metric" to="/admin/settings#rules">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.customRules") }}</span
            ><span class="metric-icon is-rules"
              ><AppIcon name="list-checks" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value">{{ customRuleCount }}</strong>
          <span class="metric-note">{{
            t("dashboard.directBlockCountInline", {
              direct: settings?.directList.length ?? 0,
              block: settings?.blockList.length ?? 0,
            })
          }}</span>
        </RouterLink>
        <RouterLink class="overview-metric" to="/admin/monitor#overall-stats">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.requests1h") }}</span
            ><span class="metric-icon is-activity"
              ><AppIcon name="activity" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value">{{ monitor ? monitor.requestsLastHour : "—" }}</strong>
          <span class="metric-note">{{ t("dashboard.requests1hNote") }}</span>
        </RouterLink>
      </section>

      <section class="overview-grid">
        <article class="dashboard-panel">
          <header class="panel-header">
            <div>
              <h3>{{ t("dashboard.runtimeState") }}</h3>
              <p>{{ t("dashboard.runtimeStateDesc") }}</p>
            </div>
            <RouterLink to="/admin/system-settings"
              >{{ t("dashboard.systemSettings") }} <AppIcon name="arrow-up-right" :size="13"
            /></RouterLink>
          </header>
          <div class="config-details">
            <div class="config-detail">
              <span>{{ t("dashboard.pacEndpoint") }}</span><code>/pac</code>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.ruleSource") }}</span
              ><strong :class="settings?.mode === 'remote' ? '' : 'value-muted'">{{
                settings?.mode === "remote" ? t("dashboard.ruleSourceRemote") : t("dashboard.ruleSourceCustom")
              }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.autoRefresh") }}</span
              ><strong :class="settings?.cronSchedule ? 'value-good' : 'value-warning'">{{
                settings?.cronSchedule ? settings.cronSchedule : t("dashboard.closed")
              }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.trend24hShort") }}</span
              ><strong>{{ monitor ? monitor.requestsLast24h : "—" }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.activeRequests") }}</span
              ><strong>{{ monitor?.activeRequests ?? "—" }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.errorRate") }}</span
              ><strong :class="monitor && monitor.errorRate > 5 ? 'value-warning' : 'value-good'">{{
                monitor ? monitor.errorRate.toFixed(1) + "%" : "—"
              }}</strong>
            </div>
          </div>
          <div class="panel-footer-links">
            <RouterLink to="/"
              >{{ t("dashboard.openPublicStatus") }} <AppIcon name="arrow-up-right" :size="13"
            /></RouterLink>
          </div>
        </article>

        <article class="dashboard-panel">
          <header class="panel-header">
            <div>
              <h3>{{ t("dashboard.recentGenLogs") }}</h3>
              <p>{{ t("dashboard.recentGenLogsDesc") }}</p>
            </div>
            <RouterLink to="/admin/logs"
              >{{ t("dashboard.viewLogs") }} <AppIcon name="arrow-up-right" :size="13"
            /></RouterLink>
          </header>
          <GenerationLogTable v-if="logs.length" :items="logs" compact height="1246px" />
          <div v-else class="panel-empty">
            {{ loading ? t("dashboard.readingGenLogs") : t("dashboard.noGenLogs") }}
          </div>
        </article>
      </section>

      <section class="dashboard-panel activity-panel">
        <header class="panel-header">
          <div>
            <h3>{{ t("dashboard.trend24h") }}</h3>
            <p>{{ t("dashboard.trend24hDesc") }}</p>
          </div>
          <RouterLink to="/admin/monitor#overall-stats"
            >{{ t("dashboard.detailMonitor") }} <AppIcon name="arrow-up-right" :size="13"
          /></RouterLink>
        </header>
        <ResponsiveTrendChart
          v-if="monitor?.requestTrend?.length"
          :points="monitor.requestTrend"
          :time-zone="settings?.timezone || 'Asia/Shanghai'"
          :aria-label="t('dashboard.trendAria')"
          compact
        />
        <div v-else class="panel-empty">{{ t("dashboard.noTrendData") }}</div>
        <div class="trend-legend">
          <span><i class="trend-swatch"></i>{{ t("dashboard.requestVolume") }}</span
          ><span><i class="trend-swatch errors"></i>{{ t("dashboard.errorRequests") }}</span>
          <span class="trend-note"
            >{{ t("dashboard.activeAndErrorRate", { active: monitor?.activeRequests ?? "—" }) }}
            {{ monitor ? monitor.errorRate.toFixed(1) + "%" : "—" }}</span
          >
        </div>
      </section>

      
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.dashboard-view {
  @apply min-w-0;
}
.dash-loading {
  @apply mb-[18px] flex items-start gap-3.5 rounded-xl border p-[18px];
  border-color: var(--line);
  background: var(--surface);
  color: var(--muted);
}
.dash-loading strong {
  @apply block text-sm;
  color: var(--text);
}
.dash-loading p {
  @apply mb-0 mt-[5px] text-[13px];
}
.spinner {
  @apply h-[18px] w-[18px] shrink-0 animate-[dash-spin_0.8s_linear_infinite] rounded-full border-2;
  border-color: var(--line);
  border-top-color: var(--accent);
}
@keyframes dash-spin {
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
.dashboard-toolbar {
  @apply mb-[18px] flex flex-wrap items-end justify-between gap-[18px];
}
.toolbar-copy h2 {
  @apply m-0 text-[clamp(20px,2.2vw,24px)] leading-tight tracking-[-0.03em];
  color: var(--text);
}
.toolbar-copy p {
  @apply mb-0 mt-1 text-[11px] leading-snug;
  color: var(--muted);
}
.toolbar-actions {
  @apply flex flex-wrap gap-2;
}
.value-muted {
  color: var(--muted);
}
.dashboard-alert {
  @apply mb-3.5 flex flex-wrap items-center gap-[9px] rounded-[9px] border px-[13px] py-[11px] text-xs leading-normal;
  border-color: var(--line);
  background: var(--surface);
}
.dashboard-alert strong {
  @apply font-extrabold;
}
.dashboard-alert a {
  @apply font-bold no-underline;
  color: var(--accent);
}
.dashboard-alert-action {
  @apply ml-auto cursor-pointer border-0 bg-transparent font-bold transition-colors;
  color: var(--accent);
  font: inherit;
}
.dashboard-alert-action:hover {
  text-decoration: underline;
}
.dashboard-alert.is-error {
  border-color: color-mix(in srgb, var(--red) 30%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
.dashboard-alert.is-warning {
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft);
}
.dashboard-alert.is-success {
  border-color: color-mix(in srgb, var(--green) 30%, var(--line));
  background: var(--green-soft);
}
.overview-metrics {
  @apply mb-[18px] grid grid-cols-4 gap-[13px];
}
.overview-metric {
  @apply flex min-w-0 cursor-pointer flex-col gap-[7px] rounded-xl border p-[17px] no-underline transition-[border-color,box-shadow,transform];
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
  color: inherit;
}
.overview-metric:hover {
  @apply -translate-y-px;
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  box-shadow: var(--shadow-sm, 0 5px 18px #0000000a);
}
.overview-metric:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .overview-metric {
    transition: none;
  }
  .overview-metric:hover {
    transform: none;
  }
}
.metric-top {
  @apply flex items-center justify-between gap-2.5;
}
.metric-label {
  @apply text-[11px] font-bold;
  color: var(--muted);
}
.metric-icon {
  @apply grid h-[34px] w-[34px] place-items-center rounded-[11px] border;
  border-color: color-mix(in srgb, var(--accent) 18%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
}
.metric-icon.is-file {
  color: var(--green);
  background: var(--green-soft);
  border-color: color-mix(in srgb, var(--green) 20%, var(--line));
}
.metric-icon.is-route {
  color: var(--accent);
}
.metric-icon.is-rules {
  color: #8b5cf6;
  background: color-mix(in srgb, #8b5cf6 11%, var(--surface));
  border-color: color-mix(in srgb, #8b5cf6 20%, var(--line));
}
.metric-icon.is-activity {
  color: #0e9f9a;
  background: color-mix(in srgb, #0e9f9a 11%, var(--surface));
  border-color: color-mix(in srgb, #0e9f9a 20%, var(--line));
}
.metric-value {
  @apply block text-[clamp(20px,2.5vw,27px)] leading-tight tracking-[-0.04em];
  overflow-wrap: anywhere;
}
.value-good {
  color: var(--green);
}
.value-warning {
  color: var(--warn);
}
.metric-note {
  @apply min-h-[29px] text-[10px] leading-normal;
  color: var(--muted);
}
.overview-grid {
  @apply mb-4 grid gap-4;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  align-items: stretch;
}
.dashboard-panel {
  @apply min-w-0 rounded-xl border p-[19px];
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.panel-header {
  @apply mb-[15px] flex items-start justify-between gap-3;
}
.panel-header h3 {
  @apply m-0 text-sm font-extrabold tracking-tight;
}
.panel-header p {
  @apply mb-0 mt-[5px] text-[10px] leading-normal;
  color: var(--muted);
}
.panel-header > a {
  @apply shrink-0 whitespace-nowrap text-[10px] font-bold no-underline;
  color: var(--accent);
}
.config-details {
  @apply grid grid-cols-2 content-start gap-x-6;
}
.config-detail {
  @apply grid min-w-0 items-baseline gap-3 border-b bg-transparent px-0 py-[13px];
  grid-template-columns: minmax(86px, 0.78fr) minmax(0, 1.22fr);
  border-color: color-mix(in srgb, var(--line) 72%, transparent);
}
.config-detail > span {
  @apply text-[11px] leading-normal;
  color: var(--muted);
  font-weight: 550;
}
.config-detail strong,
.config-detail code {
  @apply m-0 block min-w-0 rounded-none border-0 bg-transparent p-0 text-xs leading-normal shadow-none;
  color: var(--text);
  font-weight: 650;
  overflow-wrap: anywhere;
}
.config-detail code {
  @apply font-mono text-[11px];
  font-weight: 500;
}
.panel-footer-links {
  @apply mt-[15px] flex flex-wrap gap-x-4 gap-y-[9px];
}
.panel-footer-links a {
  @apply text-[10px] font-bold no-underline;
  color: var(--accent);
}
.nowrap {
  @apply whitespace-nowrap;
}
.log-message {
  @apply min-w-[135px] max-w-[220px];
  color: var(--muted);
}
.result-pill {
  @apply inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-extrabold;
  border-color: var(--line);
}
.result-pill.good {
  color: var(--green);
  background: var(--green-soft);
  border-color: color-mix(in srgb, var(--green) 24%, var(--line));
}
.result-pill.bad {
  color: var(--red);
  background: var(--red-soft);
  border-color: color-mix(in srgb, var(--red) 24%, var(--line));
}
.panel-empty {
  @apply rounded-lg border border-dashed px-3 py-6 text-center text-[11px];
  border-color: var(--line);
  color: var(--muted);
}
.activity-panel {
  @apply mb-4;
}
.trend-legend {
  @apply mt-[15px] flex flex-wrap items-center gap-[13px] text-[10px];
  color: var(--muted);
}
.trend-legend > span {
  @apply inline-flex items-center gap-1.5;
}
.trend-swatch {
  @apply h-2 w-2 rounded-[3px];
  background: var(--accent);
}
.trend-swatch.errors {
  background: var(--red);
}
.trend-note {
  @apply ml-auto;
}
.icon-spinning {
  animation: icon-spin 0.9s linear infinite;
}
@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1050px) {
  .overview-grid {
    @apply grid-cols-1;
  }
  .overview-metrics {
    @apply grid-cols-2;
  }
}
@media (max-width: 760px) {
  .dashboard-toolbar {
    @apply flex-col items-start gap-3;
  }
  .toolbar-actions {
    @apply w-full;
  }
  .toolbar-actions .app-button {
    @apply flex-1;
  }
  .config-details {
    @apply gap-x-[11px];
  }
}
@media (max-width: 500px) {
  .overview-metrics {
    @apply gap-2;
  }
  .overview-metric {
    @apply p-3;
  }
  .metric-value {
    @apply text-lg;
  }
  .metric-note {
    @apply text-[9px];
  }
  .dashboard-panel {
    @apply p-[13px];
  }
  .toolbar-actions {
    @apply grid grid-cols-2 gap-[7px];
  }
  .toolbar-actions .app-button {
    @apply w-full min-w-0 px-[7px];
  }
  .trend-note {
    @apply ml-0 basis-full;
  }
  .panel-header {
    @apply items-start;
  }
}
.workflow-running {
  @apply flex items-center gap-3 no-underline;
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
}
.workflow-running span {
  @apply grid min-w-0 gap-1;
}
.workflow-running strong {
  @apply text-xs;
}
.workflow-running small {
  @apply text-[11px];
  color: var(--muted);
  overflow-wrap: anywhere;
}
.recent-log-row {
  @apply cursor-pointer;
}
.recent-log-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.detail-kicker {
  @apply mb-[5px] mt-0 text-[10px] font-extrabold tracking-[0.08em];
  color: var(--muted);
}
</style>
