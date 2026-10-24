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
        <button type="button" @click="loadOverview">{{ t("dashboard.reload") }}</button>
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
  min-width: 0;
}
.dash-loading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  margin-bottom: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--muted);
}
.dash-loading strong {
  display: block;
  color: var(--text);
  font-size: 14px;
}
.dash-loading p {
  margin: 5px 0 0;
  font-size: 13px;
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: dash-spin 0.8s linear infinite;
  flex: 0 0 auto;
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
  @apply flex flex-wrap items-end justify-between gap-[18px] mb-[18px];
}
.toolbar-copy h2 {
  @apply m-0 text-[clamp(20px,2.2vw,24px)] leading-tight tracking-[-0.03em];
  color: var(--text);
}
.toolbar-copy p {
  @apply m-0 mt-1 text-[11px] leading-snug;
  color: var(--muted);
}
.toolbar-actions {
  @apply flex flex-wrap gap-2;
}
.value-muted {
  color: var(--muted);
}
.dashboard-alert {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 11px 13px;
  margin-bottom: 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  font-size: 12px;
  line-height: 1.5;
}
.dashboard-alert strong {
  font-weight: 800;
}
.dashboard-alert a {
  color: var(--accent);
  font-weight: 700;
  text-decoration: none;
}
.dashboard-alert button {
  margin-left: auto;
  border: 0;
  color: var(--accent);
  background: none;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
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
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
  margin-bottom: 18px;
}
.overview-metric {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 17px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.metric-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
  border-radius: 11px;
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
  display: block;
  font-size: clamp(20px, 2.5vw, 27px);
  line-height: 1.2;
  letter-spacing: -0.04em;
  overflow-wrap: anywhere;
}
.value-good {
  color: var(--green);
}
.value-warning {
  color: var(--warn);
}
.metric-note {
  min-height: 29px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  align-items: stretch;
  gap: 16px;
  margin-bottom: 16px;
}
.dashboard-panel {
  min-width: 0;
  padding: 19px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;
}
.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.panel-header p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}
.panel-header > a {
  flex: 0 0 auto;
  color: var(--accent);
  font-size: 10px;
  font-weight: 750;
  text-decoration: none;
  white-space: nowrap;
}
.config-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  align-content: start;
}
.config-detail {
  display: grid;
  grid-template-columns: minmax(86px, 0.78fr) minmax(0, 1.22fr);
  align-items: baseline;
  gap: 12px;
  min-width: 0;
  padding: 13px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  background: transparent;
}
.config-detail > span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
  line-height: 1.5;
}
.config-detail strong,
.config-detail code {
  display: block;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  overflow-wrap: anywhere;
  line-height: 1.6;
  box-shadow: none;
}
.config-detail code {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
}
.panel-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 16px;
  margin-top: 15px;
}
.panel-footer-links a {
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  text-decoration: none;
}
.nowrap {
  white-space: nowrap;
}
.log-message {
  min-width: 135px;
  max-width: 220px;
  color: var(--muted);
}
.result-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
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
  padding: 24px 12px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  color: var(--muted);
  text-align: center;
  font-size: 11px;
}
.activity-panel {
  margin-bottom: 16px;
}
.trend-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 13px;
  margin-top: 15px;
  color: var(--muted);
  font-size: 10px;
}
.trend-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.trend-swatch {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: var(--accent);
}
.icon-spinning {
  animation: icon-spin 0.9s linear infinite;
}
@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}
.trend-swatch.errors {
  background: var(--red);
}
.trend-note {
  margin-left: auto;
}
@media (max-width: 1050px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
  .overview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .dashboard-toolbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .toolbar-actions {
    width: 100%;
  }
  .toolbar-actions .app-button {
    flex: 1;
  }
  .config-details {
    gap: 0 11px;
  }
}
@media (max-width: 500px) {
  .overview-metrics {
    gap: 8px;
  }
  .overview-metric {
    padding: 12px;
  }
  .metric-value {
    font-size: 18px;
  }
  .metric-note {
    font-size: 9px;
  }
  .dashboard-panel {
    padding: 13px;
  }
  .toolbar-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .toolbar-actions .app-button {
    min-width: 0;
    width: 100%;
    padding: 0 7px;
  }
  .trend-note {
    margin-left: 0;
    flex-basis: 100%;
  }
  .panel-header {
    align-items: flex-start;
  }
}
.workflow-running {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent);
  text-decoration: none;
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
}
.workflow-running span {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.workflow-running strong {
  font-size: 12px;
}
.workflow-running small {
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}

/* Metric cards are real links, with keyboard focus and hover states matching the UI. */
.overview-metric {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
.overview-metric:hover {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  box-shadow: var(--shadow-sm, 0 5px 18px #0000000a);
  transform: translateY(-1px);
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

.recent-log-row { cursor: pointer; }
.recent-log-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.detail-kicker { margin: 0 0 5px; color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: .08em; }

</style>
