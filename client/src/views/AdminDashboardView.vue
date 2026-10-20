<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  api,
  type AdminSession,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
  type MonitorSummary,
  type PacStatus,
  type WorkflowRun,
} from "../api/client";

import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import ResponsiveTrendChart from "../components/ResponsiveTrendChart.vue";
import TextDetail from "../components/TextDetail.vue";

const { t } = useI18n();
const localizedText = (
  text: string | null | undefined,
  key: string | undefined,
  params?: Record<string, string | number>
) => (key ? t(key, params ?? {}) : text ?? "");
const router = useRouter();
const loading = ref(true);
const refreshing = ref(false);
const generating = ref(false);
const error = ref("");
const notice = ref("");
const noticeOkay = ref(true);
const session = ref<AdminSession | null>(null);
const settings = ref<AppSettings | null>(null);
const status = ref<PacStatus | null>(null);
const logs = ref<GenerationLog[]>([]);
const monitor = ref<MonitorSummary | null>(null);
const engine = ref<GenpacProbe | null>(null);
const currentWorkflow = ref<WorkflowRun | null>(null);

const modeLabel = computed(() =>
  settings.value?.mode === "remote" ? t("dashboard.remoteRuleList") : t("dashboard.customRulesLabel")
);
const customRuleCount = computed(
  () => (settings.value?.directList.length ?? 0) + (settings.value?.blockList.length ?? 0)
);
const latestLog = computed(() => logs.value[0] ?? null);

function modeForLog(value: string): string {
  return value === "remote" ? t("dashboard.remoteRuleList") : value === "custom" ? t("dashboard.customRulesLabel") : value;
}

async function loadOverview(): Promise<void> {
  loading.value = !settings.value;
  refreshing.value = true;
  error.value = "";
  try {
    const nextSession: AdminSession = await api.session();
    session.value = nextSession;
    if (!nextSession.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (nextSession.mustChangePassword) {
      await router.replace("/admin/settings");
      return;
    }

    const [nextSettings, nextStatus, nextLogs, nextMonitor, nextEngine, nextWorkflows] =
      await Promise.all([
        api.settings(),
        api.status(),
        api.logsPage(6, 0),
        api.monitorSummary().catch(() => null),
        api.genpacStatus().catch(() => null),
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
  notice.value = "";
  error.value = "";
  try {
    const result = await api.generate();
    noticeOkay.value = true;
    notice.value = t("dashboard.workflowStarted", { id: result.workflowId });
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
  <AdminLayout
    active="dashboard"
    :title="t('dashboard.title')"
    :subtitle="t('dashboard.subtitle')"
  >
    <template #actions>
      <button
        class="dash-button secondary"
        :class="{ 'is-loading': refreshing }"
        type="button"
        :disabled="refreshing"
        :title="refreshing ? t('dashboard.refreshingTitle') : t('dashboard.refreshTitle')"
        @click="loadOverview"
      >
        <AppIcon
          :name="refreshing ? 'loader-circle' : 'refresh-cw'"
          :class="{ 'icon-spinning': refreshing }"
          :size="15"
        />
        {{ refreshing ? t("common.refreshing") : t("dashboard.refreshData") }}
      </button>
    </template>

    <div class="dashboard-view">
      <section v-if="loading && !settings" class="dash-loading" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <strong>{{ t("dashboard.loadingTitle") }}</strong>
          <p>{{ t("dashboard.loadingDesc") }}</p>
        </div>
      </section>

      <div class="welcome-row">
        <div>
          <h2>{{ t("dashboard.quickActions") }}</h2>
        </div>
        <div class="quick-actions">
          <RouterLink to="/admin/settings" class="dash-button secondary"
            ><AppIcon name="settings" :size="16" />{{ t("dashboard.openSettings") }}</RouterLink
          >
          <RouterLink to="/admin/monitor" class="dash-button secondary"
            ><AppIcon name="activity" :size="16" />{{ t("dashboard.viewMonitor") }}</RouterLink
          >
          <RouterLink to="/admin/workflows" class="dash-button secondary"
            ><AppIcon name="workflow" :size="16" />{{ t("dashboard.viewWorkflow") }}</RouterLink
          >
          <button
            type="button"
            class="dash-button primary"
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
            {{ generating ? t("common.generating") : loading ? t("common.reading") : t("dashboard.generatePac") }}
          </button>
        </div>
      </div>

      <div v-if="error" class="dashboard-alert is-error" role="alert">
        <strong>{{ t("dashboard.loadFailed") }}</strong><span>{{ error }}</span>
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
              stage:
                localizedText(
                  currentWorkflow.stage,
                  currentWorkflow.stage_key,
                  currentWorkflow.stage_params
                ) || t("common.preparing"),
            })
          }}</strong
          ><small>{{
            localizedText(
              currentWorkflow.message,
              currentWorkflow.message_key,
              currentWorkflow.message_params
            )
          }} · {{ t("dashboard.clickLiveProgress") }}</small></span
        >
      </RouterLink>
      <div v-if="session?.isDefaultPassword" class="dashboard-alert is-warning" role="alert">
        <strong>{{ t("dashboard.securityAlert") }}</strong><span>{{ t("dashboard.stillDefaultPassword") }}</span>
        <RouterLink to="/admin/settings#security">{{ t("dashboard.changeNow") }}</RouterLink>
      </div>

      <section class="overview-metrics" :aria-label="t('dashboard.keyStatus')">
        <article class="overview-metric">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.pacFileStatus") }}</span
            ><span class="metric-icon is-file"
              ><AppIcon name="file-check" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value" :class="status?.hasPac ? 'value-good' : 'value-warning'">{{
            loading ? t("common.reading") : status?.hasPac ? t("common.generated") : t("common.notYetGenerated")
          }}</strong>
          <span class="metric-note">{{
            status?.hasPac ? t("dashboard.hasPacNote") : t("dashboard.noPacNote")
          }}</span>
        </article>
        <article class="overview-metric">
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
        </article>
        <article class="overview-metric">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.customRules") }}</span
            ><span class="metric-icon is-rules"
              ><AppIcon name="list-checks" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value">{{ customRuleCount }}</strong>
          <span class="metric-note"
            >{{ t("dashboard.directBlockCountInline", { direct: settings?.directList.length ?? 0, block: settings?.blockList.length ?? 0 }) }}</span
          >
        </article>
        <article class="overview-metric">
          <div class="metric-top">
            <span class="metric-label">{{ t("dashboard.requests1h") }}</span
            ><span class="metric-icon is-activity"
              ><AppIcon name="activity" :size="18" :stroke-width="1.8"
            /></span>
          </div>
          <strong class="metric-value">{{ monitor ? monitor.requestsLastHour : "—" }}</strong>
          <span class="metric-note">{{ t("dashboard.requests1hNote") }}</span>
        </article>
      </section>

      <section class="overview-grid">
        <article class="dashboard-panel">
          <header class="panel-header">
            <div>
              <h3>{{ t("dashboard.currentConfig") }}</h3>
              <p>{{ t("dashboard.currentConfigDesc") }}</p>
            </div>
            <RouterLink to="/admin/settings"
              >{{ t("dashboard.editConfig") }} <AppIcon name="arrow-up-right" :size="13"
            /></RouterLink>
          </header>
          <div class="config-details">
            <div class="config-detail">
              <span>{{ t("dashboard.generateMode") }}</span><strong>{{ modeLabel }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.timezone") }}</span><strong>{{ settings?.timezone || "—" }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.defaultProxy") }}</span><code>{{ settings?.pacProxy || "—" }}</code>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.scheduledGen") }}</span
              ><strong>{{ settings?.cronSchedule ? settings.cronSchedule : t("dashboard.closed") }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.remoteRuleUrl") }}</span
              ><code>{{ settings?.mode === "remote" ? settings.listUrl : t("dashboard.notEnabled") }}</code>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.engine") }}</span
              ><strong :class="engine?.available ? 'value-good' : 'value-warning'">{{
                engine ? (engine.available ? t("common.available") : t("common.needCheck")) : t("common.notDetected")
              }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.lastGenerated") }}</span
              ><strong>{{
                latestLog ? latestLog.created_at : status?.updatedAt || t("common.noRecords")
              }}</strong>
            </div>
            <div class="config-detail">
              <span>{{ t("dashboard.genResult") }}</span
              ><strong
                :class="latestLog?.success ? 'value-good' : latestLog ? 'value-warning' : ''"
                >{{ latestLog ? (latestLog.success ? t("common.success") : t("common.failed")) : t("common.noRecords") }}</strong
              >
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
            <RouterLink to="/admin/settings#logs"
              >{{ t("dashboard.viewLogs") }} <AppIcon name="arrow-up-right" :size="13"
            /></RouterLink>
          </header>
          <div v-if="logs.length" class="table-scroll">
            <table class="recent-table">
              <thead>
                <tr>
                  <th>{{ t("dashboard.colTime") }}</th>
                  <th>{{ t("dashboard.colResult") }}</th>
                  <th>{{ t("dashboard.colMode") }}</th>
                  <th>{{ t("dashboard.colMessage") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in logs" :key="entry.id">
                  <td class="nowrap">{{ entry.created_at }}</td>
                  <td>
                    <span class="result-pill" :class="entry.success ? 'good' : 'bad'"
                      ><AppIcon :name="entry.success ? 'circle-check' : 'circle-x'" :size="13" />{{
                        entry.success ? t("common.success") : t("common.failed")
                      }}</span
                    >
                  </td>
                  <td>{{ modeForLog(entry.mode) }}</td>
                  <td class="log-message">
                    <TextDetail
                      :text="localizedText(entry.message, entry.message_key, entry.message_params)"
                      :label="t('dashboard.genLogLabel')"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
          <RouterLink to="/admin/monitor"
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
.welcome-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}
.welcome-row h2 {
  margin: 0;
  font-size: clamp(22px, 2.5vw, 28px);
  line-height: 1.2;
  letter-spacing: -0.04em;
}
.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dash-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition:
    filter 0.15s,
    background 0.15s;
}
.dash-button.secondary,
.dash-button.logout-button {
  color: var(--text);
  background: var(--surface);
}
.dash-button.primary {
  color: var(--accent-contrast);
  background: var(--accent);
  border-color: var(--accent);
}
.dash-button:disabled {
  opacity: 1;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
  filter: none;
}
.dash-button.secondary.is-loading:disabled,
.dash-button.logout-button.is-loading:disabled {
  color: var(--text);
  -webkit-text-fill-color: var(--text);
  background: var(--surface);
  border-color: var(--line);
  cursor: progress;
}
.dash-button.secondary:hover:not(:disabled),
.dash-button.logout-button:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-2);
  border-color: color-mix(in srgb, var(--accent) 36%, var(--line));
  filter: none;
}
.dash-button.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast);
  filter: none;
}
.dash-button.primary:active:not(:disabled) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast);
}
.dash-button.secondary:active:not(:disabled),
.dash-button.logout-button:active:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
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
  gap: 0 15px;
}
.config-detail {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.config-detail > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 650;
}
.config-detail strong,
.config-detail code {
  color: var(--text);
  font-size: 11px;
  font-weight: 750;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.config-detail code {
  font-family: var(--font-mono);
  font-weight: 600;
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
.table-scroll {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.recent-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.recent-table th {
  padding: 10px;
  background: var(--surface-2);
  color: var(--muted);
  text-align: left;
  font-weight: 800;
  white-space: nowrap;
  border-bottom: 1px solid var(--line);
}
.recent-table td {
  padding: 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
.recent-table tr:last-child td {
  border-bottom: 0;
}
.recent-table tbody tr:hover {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
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
  .welcome-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .quick-actions {
    width: 100%;
  }
  .quick-actions .dash-button {
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
  .recent-table {
    min-width: 560px;
  }
  .quick-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .quick-actions .dash-button {
    min-width: 0;
    width: 100%;
    padding: 0 7px;
    white-space: normal;
    line-height: 1.25;
  }
  .quick-actions .dash-button:last-child {
    grid-column: 1 / -1;
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
</style>
