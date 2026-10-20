<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  api,
  type AccessEvent,
  type AdminSession,
  type MonitorSummary,
  type ProxyProbeBatch,
  type ProxyProbeRecord,
} from "../api/client";

import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import ResponsiveTrendChart from "../components/ResponsiveTrendChart.vue";
import TextDetail from "../components/TextDetail.vue";
import VirtualTable from "../components/VirtualTable.vue";
import SelectField from "../components/SelectField.vue";
import { useToast } from "../composables/useToast";

const { t, locale } = useI18n();
const { notify } = useToast();

const router = useRouter();
const summary = ref<MonitorSummary | null>(null);
const accesses = ref<AccessEvent[]>([]);
const accessHasMore = ref(false);
const accessLoadingMore = ref(false);
const accessLoadError = ref("");
const accessTotal = ref(0);
const probeHistory = ref<ProxyProbeRecord[]>([]);
const probeHistoryPageSize = 50;
const probeHistoryHasMore = ref(false);
const probeHistoryLoading = ref(false);
const probeHistoryLoadError = ref("");
const probeHistoryTotal = ref(0);
const latestProbe = ref<ProxyProbeBatch | null>(null);
const loading = ref(true);
const authChecking = ref(true);
const refreshing = ref(false);
const probing = ref(false);
const error = ref("");
const refreshError = ref("");
const probeError = ref("");
const proxyTestUrl = ref("https://www.google.com/generate_204");
const savedProxyTestUrl = ref("https://www.google.com/generate_204");
const proxyTestTargetLoaded = ref(false);
const loadingProxyTestTarget = ref(false);
const savingProxyTestTarget = ref(false);
const proxyTestTargetMessage = ref("");
const proxyTestTargetMessageOk = ref<boolean | null>(null);
const proxyTestTargetChanged = computed(
  () => proxyTestUrl.value.trim() !== savedProxyTestUrl.value
);
const proxyTestTargetValid = computed(() => {
  try {
    const value = proxyTestUrl.value.trim();
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !/[\u0000-\u0020\u007f]/.test(value)
    );
  } catch {
    return false;
  }
});
const lastUpdated = ref("");
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const timeZone = computed(() => summary.value?.timezone || "Asia/Shanghai");

function formatTrendHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  try {
    return new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", {
      timeZone: timeZone.value,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

const latestPacRequest = computed(() => summary.value?.latestPacRequest ?? null);

// 访问表格筛选仅作用于当前加载的最近 N 条记录，不改变服务端日志。
const accessPageSize = 50;
const accessKeyword = ref("");
const accessCategory = ref("all");
const accessStatus = ref("all");
const selectedAccess = ref<AccessEvent | null>(null);
const accessDetailDialog = ref<HTMLDialogElement | null>(null);
const accessDetailCopyState = ref("");

async function openAccessDetail(event: AccessEvent): Promise<void> {
  selectedAccess.value = event;
  accessDetailCopyState.value = "";
  await nextTick();
  if (accessDetailDialog.value && !accessDetailDialog.value.open)
    accessDetailDialog.value.showModal();
}
function closeAccessDetail(): void {
  if (accessDetailDialog.value?.open) accessDetailDialog.value.close();
}
function onAccessDetailClose(): void {
  selectedAccess.value = null;
  accessDetailCopyState.value = "";
}
function handleAccessDetailBackdrop(event: MouseEvent): void {
  if (event.target === accessDetailDialog.value) closeAccessDetail();
}
function formatAccessHeaders(raw: string | undefined): string {
  if (!raw) return t("monitor.k0");
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const keys = Object.keys(parsed).sort();
    if (!keys.length) return t("monitor.k1");
    return keys.map((key) => `${key}: ${parsed[key]}`).join("\n");
  } catch {
    return raw;
  }
}
async function copyAccessDetail(): Promise<void> {
  const event = selectedAccess.value;
  if (!event) return;
  const lines = [
    `${t("monitor.k127")}：${formatDate(event.created_at)}`,
    `${t("monitor.k137")}：${event.method}`,
    t("monitor.pathPrefix", { path: event.path }),
    `${t("monitor.k139")}：${event.query_string || t("monitor.k2")}`,
    `${t("monitor.k129")}：${categoryLabel(event.category)}`,
    `${t("monitor.k131")}：${event.status_code} ${statusLabel(event.status_code)}`,
    `${t("monitor.k132")}：${formatDuration(event.duration_ms)}`,
    `${t("monitor.k133")}：${formatBytes(event.response_bytes)}`,
    `${t("monitor.k141")}：${event.response_content_type || t("monitor.k2")}`,
    `${t("monitor.k128")}：${event.source_ip || "unknown"}`,
    `Host：${event.host || t("monitor.k2")}`,
    `${t("monitor.k138")}：${event.user_agent || t("monitor.k2")}`,
    `Referer：${event.referer || t("monitor.k2")}`,
    `Accept：${event.accept || t("monitor.k2")}`,
    `Accept-Language：${event.accept_language || t("monitor.k2")}`,
    `${t("monitor.k140")}：${event.content_type || t("monitor.k2")}`,
    "",
    t("monitor.k3"),
    formatAccessHeaders(event.request_headers),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    accessDetailCopyState.value = t("monitor.k4");
  } catch {
    accessDetailCopyState.value = t("monitor.k5");
  }
}

const filteredAccesses = computed(() => {
  const keyword = accessKeyword.value.trim().toLocaleLowerCase();
  return accesses.value.filter((event) => {
    if (accessCategory.value !== "all" && event.category !== accessCategory.value) return false;
    if (accessStatus.value === "success" && (event.status_code < 200 || event.status_code >= 300))
      return false;
    if (accessStatus.value === "redirect" && (event.status_code < 300 || event.status_code >= 400))
      return false;
    if (
      accessStatus.value === "client-error" &&
      (event.status_code < 400 || event.status_code >= 500)
    )
      return false;
    if (accessStatus.value === "server-error" && event.status_code < 500) return false;
    if (keyword) {
      const haystack = [
        event.source_ip,
        event.method,
        event.path,
        event.user_agent,
        event.host,
        event.referer,
        event.query_string,
        categoryLabel(event.category),
        String(event.status_code),
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
});
const hasAccessFilters = computed(
  () =>
    Boolean(accessKeyword.value.trim()) ||
    accessCategory.value !== "all" ||
    accessStatus.value !== "all"
);
function resetAccessFilters(): void {
  accessKeyword.value = "";
  accessCategory.value = "all";
  accessStatus.value = "all";
}

async function refreshDashboard(silent = false, resetAccess = false): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  if (!silent) error.value = "";
  try {
    const [nextSummary, page] = await Promise.all([
      api.monitorSummary(),
      api.monitorAccessPage(accessPageSize, 0),
    ]);
    summary.value = nextSummary;
    if (resetAccess || accesses.value.length === 0) {
      accesses.value = page.items;
      accessHasMore.value = page.hasMore;
    } else {
      const merged = new Map<number, AccessEvent>();
      for (const item of [...page.items, ...accesses.value]) merged.set(item.id, item);
      accesses.value = [...merged.values()].sort((a, b) => b.id - a.id);
      accessHasMore.value = accesses.value.length < page.total;
    }
    accessTotal.value = page.total;
    accessLoadError.value = "";
    lastUpdated.value = new Date().toISOString();
    refreshError.value = "";
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (silent && summary.value) refreshError.value = message;
    else error.value = message;
  } finally {
    refreshing.value = false;
    loading.value = false;
  }
}

async function loadMoreAccesses(): Promise<void> {
  if (accessLoadingMore.value || !accessHasMore.value || !accesses.value.length) return;
  accessLoadingMore.value = true;
  accessLoadError.value = "";
  try {
    const cursor = accesses.value[accesses.value.length - 1]?.id ?? 0;
    const page = await api.monitorAccessPage(accessPageSize, cursor);
    const seen = new Set(accesses.value.map((item) => item.id));
    accesses.value.push(...page.items.filter((item) => !seen.has(item.id)));
    accesses.value.sort((a, b) => b.id - a.id);
    accessHasMore.value = page.hasMore;
    accessTotal.value = page.total;
  } catch (caught) {
    accessLoadError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    accessLoadingMore.value = false;
  }
}

async function loadProbeHistory(reset = true): Promise<void> {
  if (probeHistoryLoading.value) return;
  probeHistoryLoading.value = true;
  probeHistoryLoadError.value = "";
  try {
    const cursor = reset ? 0 : (probeHistory.value[probeHistory.value.length - 1]?.id ?? 0);
    const page = await api.proxyProbeHistoryPage(probeHistoryPageSize, cursor);
    if (reset) probeHistory.value = page.items;
    else {
      const seen = new Set(probeHistory.value.map((item) => item.id));
      probeHistory.value.push(...page.items.filter((item) => !seen.has(item.id)));
    }
    probeHistoryHasMore.value = page.hasMore;
    probeHistoryTotal.value = page.total;
    probeError.value = "";
  } catch (caught) {
    probeHistoryLoadError.value = caught instanceof Error ? caught.message : String(caught);
    probeError.value = probeHistoryLoadError.value;
  } finally {
    probeHistoryLoading.value = false;
  }
}

async function loadProxyTestTarget(): Promise<void> {
  if (loadingProxyTestTarget.value) return;
  loadingProxyTestTarget.value = true;
  proxyTestTargetMessage.value = "";
  proxyTestTargetMessageOk.value = null;
  try {
    const result = await api.proxyProbeTarget();
    proxyTestUrl.value = result.url;
    savedProxyTestUrl.value = result.url;
    proxyTestTargetLoaded.value = true;
  } catch (caught) {
    proxyTestTargetLoaded.value = false;
    proxyTestTargetMessageOk.value = false;
    proxyTestTargetMessage.value = caught instanceof Error ? caught.message : String(caught);
    notify(proxyTestTargetMessage.value, "error");
  } finally {
    loadingProxyTestTarget.value = false;
  }
}

async function saveProxyTestTarget(): Promise<void> {
  if (
    !proxyTestTargetLoaded.value ||
    savingProxyTestTarget.value ||
    !proxyTestTargetValid.value ||
    !proxyTestTargetChanged.value
  )
    return;
  savingProxyTestTarget.value = true;
  proxyTestTargetMessage.value = "";
  proxyTestTargetMessageOk.value = null;
  try {
    const result = await api.saveProxyProbeTarget(proxyTestUrl.value.trim());
    proxyTestUrl.value = result.url;
    savedProxyTestUrl.value = result.url;
    proxyTestTargetMessageOk.value = true;
    proxyTestTargetMessage.value = t("monitor.k6");
    notify(t("monitor.k7"), "success");
  } catch (caught) {
    proxyTestTargetMessageOk.value = false;
    proxyTestTargetMessage.value = caught instanceof Error ? caught.message : String(caught);
    notify(proxyTestTargetMessage.value, "error");
  } finally {
    savingProxyTestTarget.value = false;
  }
}

async function runProxyTest(): Promise<void> {
  if (probing.value || !proxyTestTargetLoaded.value || proxyTestTargetChanged.value) return;
  probing.value = true;
  probeError.value = "";
  latestProbe.value = null;
  try {
    latestProbe.value = await api.testProxies();
    notify(t("monitor.k8"), "success");
    await loadProbeHistory();
    await refreshDashboard(true);
  } catch (caught) {
    probeError.value = caught instanceof Error ? caught.message : String(caught);
    notify(probeError.value, "error");
    await loadProbeHistory();
  } finally {
    probing.value = false;
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", {
      timeZone: timeZone.value,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN");
  }
}

function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 1000) return (value / 1000).toFixed(2) + " s";
  return value.toFixed(1) + " ms";
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value < 1) return "—";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KiB";
  return (value / (1024 * 1024)).toFixed(2) + " MiB";
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    page: t("monitor.k9"),
    pac: t("monitor.k10"),
    "public-api": t("monitor.k11"),
    "admin-api": t("monitor.k12"),
  };
  return labels[category] || category;
}

function statusLabel(code: number): string {
  if (code === 304) return t("monitor.k13");
  if (code >= 500) return t("monitor.k14");
  if (code >= 400) return t("monitor.k15");
  if (code >= 300) return t("monitor.k16");
  return t("monitor.k17");
}

function statusTone(code: number): string {
  if (code >= 500) return "bad";
  if (code >= 400) return "warn";
  return "good";
}

function probePhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    TCP: t("monitor.k18"),
    PROXY_TLS: t("monitor.k19"),
    PROXY_HANDSHAKE: t("monitor.k20"),
    TARGET_TLS: t("monitor.k21"),
    TARGET_HTTP: t("monitor.k22"),
    complete: t("monitor.k23"),
  };
  return labels[phase] || phase;
}

async function initialise(): Promise<void> {
  try {
    const session: AdminSession = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (session.mustChangePassword) {
      await router.replace("/admin");
      return;
    }
    authChecking.value = false;
    await Promise.all([refreshDashboard(), loadProbeHistory(), loadProxyTestTarget()]);
    refreshTimer = setInterval(() => {
      void refreshDashboard(true);
    }, 15000);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    loading.value = false;
    authChecking.value = false;
  }
}

onMounted(() => {
  void initialise();
});
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <AdminLayout
    active="monitor"
    :title='t("monitor.k24")'
    :subtitle='t("monitor.k25")'
  >
    <template #actions>
      <span v-if="lastUpdated" class="monitor-top-updated">
        <span class="live-dot" :class="{ busy: refreshing }"></span>
        {{ t("monitor.updatedAt", { time: formatDate(lastUpdated) }) }}
      </span>
      <button
        class="monitor-button secondary"
        :class="{ 'is-loading': refreshing }"
        type="button"
        :disabled="refreshing"
        :title="refreshing ? t('monitor.refreshingTitle') : t('monitor.refreshTitle')"
        @click="refreshDashboard()"
      >
        <AppIcon
          :name="refreshing ? 'loader-circle' : 'refresh-cw'"
          :class="{ 'icon-spinning': refreshing }"
          :size="15"
        />
        {{ refreshing ? t("common.refreshing") : t("common.refresh") }}
      </button>
    </template>

    <div class="monitor-page">
      <div class="monitor-page-note">
        {{ t("monitor.k61") }}
      </div>

      <section v-if="authChecking || loading" class="monitor-state" aria-live="polite">
        <span class="monitor-spinner"></span>
        <div>
          <strong>{{ t("monitor.k62") }}</strong>
          <p>{{ t("monitor.k63") }}</p>
        </div>
      </section>

      <section v-else-if="error && !summary" class="monitor-state is-error" role="alert">
        <div>
          <strong>{{ t("monitor.k64") }}</strong>
          <p>{{ error }}</p>
        </div>
        <button class="monitor-button secondary" type="button" @click="refreshDashboard()">
          {{ t("monitor.k65") }}
        </button>
      </section>

      <template v-else>
        <div v-if="error" class="monitor-alert is-error" role="alert">{{ error }}</div>
        <div v-if="refreshError" class="monitor-alert is-warning" role="status">
          {{ t("monitor.autoRefreshError", { error: refreshError }) }}
        </div>

        <section class="monitor-panel pac-overview-panel" aria-labelledby="pac-overview-title">
          <div class="panel-heading">
            <div>
              <h2 id="pac-overview-title"><AppIcon name="route" :size="17" />{{ t("monitor.k66") }}</h2>
              <p>
                {{ t("monitor.k67") }} <code>/proxy.pac</code> {{ t("monitor.k68") }}
              </p>
            </div>
            <span class="panel-count">{{ t("monitor.k69") }}</span>
          </div>

          <div class="pac-metric-grid">
            <article class="metric-card pac-metric-primary">
              <span class="metric-label"><AppIcon name="route" :size="15" />{{ t("monitor.k70") }}</span>
              <strong class="metric-value">{{ summary?.pacRequestsLast24h ?? 0 }}</strong>
              <span class="metric-note">{{ t("monitor.lastHourCount", { n: summary?.pacRequestsLastHour ?? 0 }) }}</span>
            </article>
            <article class="metric-card">
              <span class="metric-label"
                ><AppIcon name="circle-check" :size="15" />{{ t("monitor.k71") }}</span
              >
              <strong
                class="metric-value"
                :class="(summary?.pacSuccessRate ?? 100) < 99 ? 'value-warn' : ''"
              >
                {{
                  (summary?.pacRequestsLast24h ?? 0) > 0
                    ? summary!.pacSuccessRate.toFixed(1) + "%"
                    : "—"
                }}
              </strong>
              <span class="metric-note">{{ t("monitor.k72") }}</span>
            </article>
            <article class="metric-card">
              <span class="metric-label"
                ><AppIcon name="circle-alert" :size="15" />{{ t("monitor.k73") }}</span
              >
              <strong
                class="metric-value"
                :class="(summary?.pacFailureRequestsLast24h ?? 0) > 0 ? 'value-warn' : ''"
                >{{ summary?.pacFailureRequestsLast24h ?? 0 }}</strong
              >
              <span class="metric-note">{{ t("monitor.k74") }}</span>
            </article>
            <article class="metric-card">
              <span class="metric-label"><AppIcon name="timer" :size="15" />{{ t("monitor.k75") }}</span>
              <strong class="metric-value">{{
                (summary?.pacRequestsLast24h ?? 0) > 0
                  ? formatDuration(summary?.pacAverageResponseMs)
                  : "—"
              }}</strong>
              <span class="metric-note">{{ t("monitor.k76") }}</span>
            </article>
          </div>

          <div class="pac-latest">
            <div class="pac-latest-heading">
              <strong><AppIcon name="clock" :size="15" />{{ t("monitor.k77") }}</strong>
              <span
                v-if="latestPacRequest"
                class="status-pill"
                :class="statusTone(latestPacRequest.status_code)"
              >
                <AppIcon
                  :name="
                    statusTone(latestPacRequest.status_code) === 'good'
                      ? 'circle-check'
                      : statusTone(latestPacRequest.status_code) === 'bad'
                        ? 'circle-x'
                        : 'circle-alert'
                  "
                  :size="12"
                />
                {{ latestPacRequest.status_code }} {{ statusLabel(latestPacRequest.status_code) }}
              </span>
            </div>
            <div v-if="latestPacRequest" class="pac-latest-grid">
              <div>
                <span>{{ t("monitor.k78") }}</span><strong>{{ formatDate(latestPacRequest.created_at) }}</strong>
              </div>
              <div>
                <span>{{ t("monitor.k79") }}</span
                ><strong
                  ><code>{{ latestPacRequest.source_ip || "unknown" }}</code></strong
                >
              </div>
              <div>
                <span>{{ t("monitor.k80") }}</span
                ><strong>{{ formatDuration(latestPacRequest.duration_ms) }}</strong>
              </div>
            </div>
            <div v-else class="pac-no-latest">
              {{ t("monitor.k81") }} <code>/proxy.pac</code> {{ t("monitor.k82") }}
            </div>
          </div>
        </section>

        <section class="monitor-panel pac-trend-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="chart" :size="17" />{{ t("monitor.k83") }}</h2>
              <p>
                {{ t("monitor.k84") }}
              </p>
            </div>
            <span class="panel-count"
              >{{ t("monitor.peakPerHour", { n: Math.max(0, ...(summary?.pacRequestTrend ?? []).map((item) => item.requests)) }) }}</span
            >
          </div>
          <ResponsiveTrendChart
            v-if="(summary?.pacRequestsLast24h ?? 0) > 0"
            mode="count"
            :points="summary!.pacRequestTrend"
            :time-zone="timeZone"
            :aria-label='t("monitor.k29")'
          />
          <div v-else class="monitor-empty">{{ t("monitor.k85") }}</div>
          <div class="trend-legend">
            <span><i class="legend-swatch request-swatch"></i>{{ t("monitor.k86") }}</span>
            <span><i class="legend-swatch error-swatch"></i>{{ t("monitor.k87") }}</span>
          </div>
          <div class="pac-latency-heading">
            <strong><AppIcon name="timer" :size="15" />{{ t("monitor.k88") }}</strong>
            <span>{{ t("monitor.k89") }}</span>
          </div>
          <ResponsiveTrendChart
            v-if="(summary?.pacRequestsLast24h ?? 0) > 0 && summary?.pacRequestTrend?.length"
            mode="latency"
            :points="summary!.pacRequestTrend"
            :time-zone="timeZone"
            :aria-label='t("monitor.k30")'
          />
          <div v-else class="pac-no-latest">
            {{ t("monitor.k90") }}
          </div>
        </section>

        <div class="overall-stats-heading">
          <h2><AppIcon name="activity" :size="17" />{{ t("monitor.k31") }}</h2>
          <p>{{ t("monitor.k91") }}</p>
        </div>
        <section class="metric-grid" :aria-label='t("monitor.k31")'>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="activity" :size="15" />{{ t("monitor.k92") }}</span>
            <strong class="metric-value">{{ summary?.activeRequests ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k93") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="network" :size="15" />{{ t("monitor.k94") }}</span>
            <strong class="metric-value">{{ summary?.tcpConnections ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k95") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="clock" :size="15" />{{ t("monitor.k96") }}</span>
            <strong class="metric-value">{{ summary?.requestsLastHour ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k97") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="globe" :size="15" />{{ t("monitor.k98") }}</span>
            <strong class="metric-value">{{ summary?.uniqueSourcesLast24h ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k99") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="chart" :size="15" />{{ t("monitor.k100") }}</span>
            <strong class="metric-value">{{ summary?.requestsLast24h ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k101") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="circle-alert" :size="15" />{{ t("monitor.k102") }}</span
            >
            <strong
              class="metric-value"
              :class="(summary?.errorRate ?? 0) >= 5 ? 'value-warn' : ''"
            >
              {{ summary ? summary.errorRate.toFixed(1) + "%" : "0.0%" }}
            </strong>
            <span class="metric-note"
              >HTTP 4xx/5xx · 5xx {{ summary?.serverErrorsLast24h ?? 0 }}</span
            >
          </article>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="timer" :size="15" />{{ t("monitor.k103") }}</span>
            <strong class="metric-value">{{ formatDuration(summary?.averageResponseMs) }}</strong>
            <span class="metric-note">{{ t("monitor.k76") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"><AppIcon name="gauge" :size="15" />{{ t("monitor.k104") }}</span>
            <strong class="metric-value">{{ formatDuration(summary?.p95ResponseMs) }}</strong>
            <span class="metric-note">{{ t("monitor.k105") }}</span>
          </article>
        </section>

        <section class="monitor-panel trend-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="chart" :size="17" />{{ t("monitor.k106") }}</h2>
              <p>
                {{ t("monitor.k107") }}
              </p>
            </div>
            <span class="panel-count"
              >{{ t("monitor.peakPerHour", { n: Math.max(0, ...(summary?.requestTrend ?? []).map((item) => item.requests)) }) }}</span
            >
          </div>
          <ResponsiveTrendChart
            v-if="summary?.requestTrend?.length"
            mode="count"
            :points="summary.requestTrend"
            :time-zone="timeZone"
            :aria-label='t("monitor.k32")'
          />
          <div v-else class="monitor-empty">
            {{ t("monitor.k108") }}
          </div>
          <div class="trend-legend">
            <span><i class="legend-swatch request-swatch"></i>{{ t("monitor.k109") }}</span>
            <span><i class="legend-swatch error-swatch"></i>{{ t("monitor.k110") }}</span>
            <span class="trend-sample-note">{{ t("monitor.k111") }}</span>
          </div>
        </section>

        <section class="monitor-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="list-checks" :size="17" />{{ t("monitor.k112") }}</h2>
              <p>{{ t("monitor.k113") }}</p>
            </div>
            <div class="panel-actions">
              <span class="panel-count"
                >{{ t("monitor.matchCount", { filtered: filteredAccesses.length, total: accesses.length }) }}</span
              >
            </div>
          </div>

          <div class="monitor-notice">
            <strong>{{ t("monitor.k114") }}</strong>{{ t("monitor.k115") }}
          </div>

          <div class="access-filters" :aria-label='t("monitor.k33")'>
            <label class="access-filter search-filter">
              <span>{{ t("monitor.k116") }}</span>
              <input
                v-model="accessKeyword"
                type="search"
                :placeholder='t("monitor.k34")'
                autocomplete="off"
              />
            </label>
            <label class="access-filter">
              <span>{{ t("monitor.k117") }}</span>
              <SelectField block
                ><select v-model="accessCategory">
                  <option value="all">{{ t("monitor.k118") }}</option>
                  <option value="pac">{{ t("monitor.k10") }}</option>
                  <option value="page">{{ t("monitor.k9") }}</option>
                  <option value="public-api">{{ t("monitor.k11") }}</option>
                  <option value="admin-api">{{ t("monitor.k12") }}</option>
                </select></SelectField
              >
            </label>
            <label class="access-filter">
              <span>{{ t("monitor.k119") }}</span>
              <SelectField block
                ><select v-model="accessStatus">
                  <option value="all">{{ t("monitor.k120") }}</option>
                  <option value="success">{{ t("monitor.k121") }}</option>
                  <option value="redirect">{{ t("monitor.k122") }}</option>
                  <option value="client-error">{{ t("monitor.k123") }}</option>
                  <option value="server-error">{{ t("monitor.k124") }}</option>
                </select></SelectField
              >
            </label>
            <div
              class="access-reset-wrap"
              :title="
                hasAccessFilters
                  ? t('monitor.k35')
                  : t('monitor.k36')
              "
            >
              <button
                class="monitor-button secondary access-filter-reset"
                type="button"
                :disabled="!hasAccessFilters"
                @click="resetAccessFilters"
              >
                <AppIcon name="x" :size="14" />{{ t("monitor.k125") }}
              </button>
            </div>
          </div>

          <div v-if="accesses.length === 0" class="monitor-empty">
            {{ t("monitor.k126") }}
          </div>
          <VirtualTable
            v-else
            :items="filteredAccesses"
            item-key="id"
            :col-span="8"
            :row-height="58"
            height="520px"
            min-width="1225px"
            table-class="monitor-table"
            :has-more="accessHasMore"
            :loading="accessLoadingMore"
            :error="accessLoadError"
            :empty-text="hasAccessFilters ? t('monitor.noFilteredAccess') : t('monitor.noAccess')"
            :load-more="loadMoreAccesses"
          >
            <template #columns>
              <col style="width: 145px" />
              <col style="width: 310px" />
              <col style="width: 90px" />
              <col style="width: 210px" />
              <col style="width: 120px" />
              <col style="width: 85px" />
              <col style="width: 95px" />
              <col style="width: 170px" />
            </template>
            <template #header>
              <tr>
                <th>{{ t("monitor.k127") }}</th>
                <th>{{ t("monitor.k128") }}</th>
                <th>{{ t("monitor.k129") }}</th>
                <th>{{ t("monitor.k130") }}</th>
                <th>{{ t("monitor.k131") }}</th>
                <th>{{ t("monitor.k132") }}</th>
                <th>{{ t("monitor.k133") }}</th>
                <th>{{ t("monitor.k134") }}</th>
              </tr>
            </template>
            <template #row="{ item: event }">
              <tr class="access-row" :title='t("monitor.k38")' @click="openAccessDetail(event)">
                <td class="nowrap">{{ formatDate(event.created_at) }}</td>
                <td>
                  <code>{{ event.source_ip || "unknown" }}</code>
                </td>
                <td>
                  <span class="category-pill">{{ categoryLabel(event.category) }}</span>
                </td>
                <td class="path-cell">
                  <span class="method-label">{{ event.method }}</span
                  ><code>{{ event.path }}</code>
                </td>
                <td>
                  <span class="status-pill" :class="statusTone(event.status_code)"
                    ><AppIcon
                      :name="
                        statusTone(event.status_code) === 'good'
                          ? 'circle-check'
                          : statusTone(event.status_code) === 'bad'
                            ? 'circle-x'
                            : 'circle-alert'
                      "
                      :size="12"
                    />{{ event.status_code }} {{ statusLabel(event.status_code) }}</span
                  >
                </td>
                <td class="nowrap">{{ formatDuration(event.duration_ms) }}</td>
                <td class="nowrap">{{ formatBytes(event.response_bytes) }}</td>
                <td class="ua-cell">
                  <span class="ua-preview">{{ event.user_agent || "—" }}</span>
                </td>
              </tr>
            </template>
          </VirtualTable>
          <p class="panel-footnote">
            {{ t("monitor.accessLoadedHint", { loaded: accesses.length, total: accessTotal }) }}
          </p>
        </section>

        <dialog
          v-if="selectedAccess"
          ref="accessDetailDialog"
          class="access-detail-dialog"
          :aria-label='t("monitor.k39")'
          @click="handleAccessDetailBackdrop"
          @close="onAccessDetailClose"
        >
          <header class="access-detail-header">
            <div>
              <p class="access-detail-kicker">ACCESS LOG #{{ selectedAccess.id }}</p>
              <h2>{{ t("monitor.k135") }}</h2>
            </div>
            <div class="access-detail-actions">
              <button class="monitor-button secondary" type="button" @click="copyAccessDetail">
                <AppIcon name="copy" :size="14" />{{ t("monitor.k136") }}
              </button>
              <button
                class="monitor-button secondary"
                type="button"
                :aria-label='t("monitor.k40")'
                @click="closeAccessDetail"
              >
                <AppIcon name="x" :size="14" />
              </button>
            </div>
          </header>
          <p v-if="accessDetailCopyState" class="access-detail-copy-state" role="status">
            {{ accessDetailCopyState }}
          </p>
          <div class="access-detail-grid">
            <div>
              <span>{{ t("monitor.k127") }}</span><strong>{{ formatDate(selectedAccess.created_at) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k137") }}</span
              ><strong
                ><code>{{ selectedAccess.method }}</code></strong
              >
            </div>
            <div>
              <span>{{ t("monitor.k129") }}</span><strong>{{ categoryLabel(selectedAccess.category) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k131") }}</span
              ><strong
                >{{ selectedAccess.status_code }}
                {{ statusLabel(selectedAccess.status_code) }}</strong
              >
            </div>
            <div>
              <span>{{ t("monitor.k132") }}</span><strong>{{ formatDuration(selectedAccess.duration_ms) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k133") }}</span><strong>{{ formatBytes(selectedAccess.response_bytes) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k128") }}</span
              ><strong
                ><code>{{ selectedAccess.source_ip || "unknown" }}</code></strong
              >
            </div>
            <div>
              <span>Host</span
              ><strong
                ><code>{{ selectedAccess.host || "—" }}</code></strong
              >
            </div>
          </div>
          <div class="access-detail-block">
            <span>{{ t("monitor.k138") }}</span>
            <pre>{{ selectedAccess.user_agent || t("monitor.k2") }}</pre>
          </div>
          <div class="access-detail-block">
            <span>{{ t("monitor.k130") }}</span>
            <pre>{{ selectedAccess.path }}</pre>
          </div>
          <div class="access-detail-block">
            <span>{{ t("monitor.k139") }}</span>
            <pre>{{ selectedAccess.query_string || t("monitor.k2") }}</pre>
          </div>
          <div class="access-detail-block">
            <span>Referer</span>
            <pre>{{ selectedAccess.referer || t("monitor.k2") }}</pre>
          </div>
          <div class="access-detail-block">
            <span>Accept / Accept-Language</span>
            <pre
              >{{ selectedAccess.accept || t("monitor.k2") }}
{{ selectedAccess.accept_language || t("monitor.k2") }}</pre
            >
          </div>
          <div class="access-detail-block">
            <span>{{ t("monitor.k140") }}</span>
            <pre>{{ selectedAccess.content_type || t("monitor.k2") }}</pre>
          </div>
          <div class="access-detail-block">
            <span>{{ t("monitor.k141") }}</span>
            <pre>{{ selectedAccess.response_content_type || t("monitor.k2") }}</pre>
          </div>
          <div class="access-detail-block">
            <span>{{ t("monitor.k142") }}</span>
            <pre>{{ formatAccessHeaders(selectedAccess.request_headers) }}</pre>
          </div>
        </dialog>

        <section class="monitor-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="zap" :size="17" />{{ t("monitor.k143") }}</h2>
              <p>
                {{ t("monitor.k144") }}
              </p>
            </div>
            <button
              class="monitor-button primary"
              :class="{ 'is-loading': probing }"
              type="button"
              :disabled="
                probing || savingProxyTestTarget || !proxyTestTargetLoaded || proxyTestTargetChanged
              "
              :title="
                probing
                  ? t('monitor.k41')
                  : savingProxyTestTarget
                    ? t('monitor.k42')
                    : !proxyTestTargetLoaded
                      ? t('monitor.k43')
                      : proxyTestTargetChanged
                        ? t('monitor.k44')
                        : t('monitor.k45')
              "
              @click="runProxyTest"
            >
              <AppIcon
                :name="probing ? 'loader-circle' : 'zap'"
                :class="{ 'icon-spinning': probing }"
                :size="15"
              />{{ probing ? t("monitor.k46") : t("monitor.k47") }}
            </button>
          </div>

          <div class="probe-target">
            <span class="target-icon" aria-hidden="true"
              ><AppIcon name="network" :size="18"
            /></span>
            <div class="probe-target-content">
              <label for="proxy-test-target">{{ t("monitor.k145") }}</label>
              <div class="probe-target-controls">
                <input
                  id="proxy-test-target"
                  v-model="proxyTestUrl"
                  class="probe-target-input"
                  type="url"
                  autocomplete="url"
                  spellcheck="false"
                  placeholder="https://www.google.com/generate_204"
                  :disabled="
                    !proxyTestTargetLoaded ||
                    loadingProxyTestTarget ||
                    savingProxyTestTarget ||
                    probing
                  "
                  @input="
                    proxyTestTargetMessage = '';
                    proxyTestTargetMessageOk = null;
                  "
                />
                <button
                  v-if="!proxyTestTargetLoaded && loadingProxyTestTarget"
                  class="monitor-button secondary is-loading"
                  type="button"
                  disabled
                  :title='t("monitor.k48")'
                  aria-live="polite"
                >
                  <AppIcon name="loader-circle" class="icon-spinning" :size="14" />
                  {{ t("monitor.k146") }}
                </button>
                <button
                  v-else-if="!proxyTestTargetLoaded"
                  class="monitor-button secondary"
                  type="button"
                  :disabled="savingProxyTestTarget || probing"
                  :title="
                    savingProxyTestTarget
                      ? t('monitor.k42')
                      : probing
                        ? t('monitor.k49')
                        : t('monitor.k50')
                  "
                  @click="loadProxyTestTarget"
                >
                  <AppIcon name="refresh-cw" :size="14" />
                  {{ t("monitor.k147") }}
                </button>
                <button
                  v-else-if="proxyTestTargetChanged"
                  class="monitor-button secondary"
                  :class="{ 'is-loading': savingProxyTestTarget }"
                  type="button"
                  :disabled="savingProxyTestTarget || probing || !proxyTestTargetValid"
                  :title="
                    savingProxyTestTarget
                      ? t('monitor.k42')
                      : probing
                        ? t('monitor.k49')
                        : !proxyTestTargetValid
                          ? t('monitor.k51')
                          : t('monitor.k52')
                  "
                  @click="saveProxyTestTarget"
                >
                  <AppIcon
                    :name="savingProxyTestTarget ? 'loader-circle' : 'save'"
                    :class="{ 'icon-spinning': savingProxyTestTarget }"
                    :size="14"
                  />
                  {{ savingProxyTestTarget ? t("monitor.k53") : t("monitor.k54") }}
                </button>
                <span v-else class="monitor-saved-state" role="status">
                  <AppIcon name="check-circle" :size="14" />
                  {{ t("monitor.k148") }}
                </span>
              </div>
              <p>
                {{ t("monitor.k149") }} <code>https://www.google.com/generate_204</code>{{ t("monitor.k150") }}
              </p>
              <p v-if="!proxyTestTargetValid" class="probe-target-hint is-warning">
                {{ t("monitor.k151") }}
              </p>
              <p v-else-if="proxyTestTargetChanged" class="probe-target-hint is-warning">
                {{ t("monitor.k152") }}
              </p>
              <p v-else class="probe-target-hint">
                {{ t("monitor.k153") }}<code>{{ savedProxyTestUrl }}</code>
              </p>
              <p
                v-if="proxyTestTargetMessage"
                class="probe-target-message"
                :class="proxyTestTargetMessageOk ? 'is-success' : 'is-error'"
                role="status"
                aria-live="polite"
              >
                {{ proxyTestTargetMessage }}
              </p>
            </div>
          </div>

          <div v-if="probeError" class="monitor-alert is-error" role="alert">{{ probeError }}</div>

          <div v-if="latestProbe" class="probe-results">
            <div class="probe-run-head">
              <strong>{{ t("monitor.k154") }}</strong>
              <span
                >{{ t("monitor.nodeCount", { n: latestProbe.results.length }) }} ·
                {{ formatDate(latestProbe.results[0]?.testedAt) }}</span
              >
            </div>
            <p class="panel-footnote probe-run-target">
              {{ t("monitor.k155") }}<code>{{ latestProbe.targetUrl }}</code>
            </p>
            <div
              v-for="(result, index) in latestProbe.results"
              :key="result.proxyLabel + index"
              class="probe-card"
            >
              <div class="probe-card-top">
                <div class="probe-title">
                  <span
                    class="probe-state-dot"
                    :class="result.success ? 'is-good' : 'is-bad'"
                  ></span>
                  <strong>{{ result.proxyLabel }}</strong>
                </div>
                <span class="status-pill" :class="result.success ? 'good' : 'bad'"
                  ><AppIcon :name="result.success ? 'circle-check' : 'circle-x'" :size="12" />{{
                    result.success ? t("monitor.k55") : t("monitor.k56")
                  }}</span
                >
              </div>
              <div class="probe-metrics">
                <div>
                  <span>{{ t("monitor.k156") }}</span><strong>{{ formatDuration(result.tcpMs) }}</strong>
                </div>
                <div>
                  <span>{{ t("monitor.k157") }}</span><strong>{{ formatDuration(result.handshakeMs) }}</strong>
                </div>
                <div>
                  <span>{{ t("monitor.k158") }}</span><strong>{{ formatDuration(result.targetMs) }}</strong>
                </div>
                <div>
                  <span>{{ t("monitor.k159") }}</span><strong>{{ probePhaseLabel(result.phase) }}</strong>
                </div>
              </div>
              <p v-if="result.httpStatus" class="probe-detail">
                {{ t("monitor.targetStatusCode", { code: result.httpStatus }) }}
              </p>
              <p v-if="result.error" class="probe-error">{{ result.error }}</p>
              <p v-if="result.isLoopback" class="monitor-alert is-warning">
                {{ t("monitor.k160") }}
              </p>
            </div>
            <p v-if="latestProbe.parseWarnings.length" class="probe-warning">
              {{ t("monitor.uncheckedItems", { items: latestProbe.parseWarnings.join("; ") }) }}
            </p>
            <p v-if="latestProbe.limited" class="probe-warning">
              {{ t("monitor.k161") }}
            </p>
            <p v-if="latestProbe.ignoredDirectEntries" class="panel-footnote">
              {{ t("monitor.ignoredDirect", { n: latestProbe.ignoredDirectEntries }) }}
            </p>
          </div>

          <div v-else-if="!probing" class="monitor-empty">
            {{ t("monitor.k162") }}
          </div>
          <div v-if="probing" class="probe-progress">
            <span class="monitor-spinner"></span>
            <span>{{ t("monitor.k163") }}</span>
          </div>
        </section>

        <section class="monitor-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="clock" :size="17" />{{ t("monitor.k164") }}</h2>
              <p>{{ t("monitor.k165") }}</p>
            </div>
            <div class="panel-actions">
              <span class="panel-count"
                >{{ t("monitor.probeLoaded", { loaded: probeHistory.length, total: probeHistoryTotal }) }}</span
              >
            </div>
          </div>
          <VirtualTable
            :items="probeHistory"
            item-key="id"
            :col-span="7"
            :row-height="58"
            height="420px"
            min-width="900px"
            table-class="monitor-table"
            :has-more="probeHistoryHasMore"
            :loading="probeHistoryLoading"
            :error="probeHistoryLoadError"
            :empty-text='t("monitor.k57")'
            :load-more="() => loadProbeHistory(false)"
          >
            <template #columns
              ><col style="width: 145px" />
              <col style="width: 150px" />
              <col style="width: 80px" />
              <col style="width: 80px" />
              <col style="width: 100px" />
              <col style="width: 90px" />
              <col style="width: 260px"
            /></template>
            <template #header
              ><tr>
                <th>{{ t("monitor.k166") }}</th>
                <th>{{ t("monitor.k167") }}</th>
                <th>{{ t("monitor.k168") }}</th>
                <th>TCP</th>
                <th>{{ t("monitor.k169") }}</th>
                <th>{{ t("monitor.k158") }}</th>
                <th>{{ t("monitor.k170") }}</th>
              </tr></template
            >
            <template #row="{ item }">
              <tr>
                <td class="nowrap">{{ formatDate(item.tested_at) }}</td>
                <td>
                  <code>{{ item.proxy_label }}</code>
                </td>
                <td>
                  <span class="status-pill" :class="item.success ? 'good' : 'bad'"
                    ><AppIcon :name="item.success ? 'circle-check' : 'circle-x'" :size="12" />{{
                      item.success ? t("monitor.k55") : t("monitor.k58")
                    }}</span
                  >
                </td>
                <td class="nowrap">{{ formatDuration(item.tcp_ms) }}</td>
                <td class="nowrap">{{ formatDuration(item.handshake_ms) }}</td>
                <td class="nowrap">{{ formatDuration(item.target_ms) }}</td>
                <td class="probe-history-error">
                  <TextDetail
                    v-if="!item.success"
                    :text="probePhaseLabel(item.phase) + ': ' + (item.error || t('monitor.noProbeErrorDetails'))"
                    :label='t("monitor.k60")'
                  /><span v-else>—</span>
                </td>
              </tr>
            </template>
          </VirtualTable>
          <p class="panel-footnote">
            {{ t("monitor.k171") }}
          </p>
        </section>
      </template>

      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.monitor-page {
  --monitor-gap: 18px;
  min-width: 0;
}
.monitor-top-updated {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}
.monitor-page-note {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}
.monitor-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.monitor-title-row .page-intro {
  max-width: 48rem;
}
.monitor-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 12px;
}
.live-dot,
.probe-state-dot {
  width: 8px;
  height: 8px;
  display: inline-block;
  border-radius: 999px;
  background: var(--green);
  flex: 0 0 auto;
}
.live-dot.busy {
  background: var(--warn);
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 12px 0 var(--space-5);
}
.overall-stats-heading {
  margin: 24px 0 8px;
}
.overall-stats-heading h2 {
  margin: 0;
  font-size: 16px;
  letter-spacing: -0.02em;
}
.overall-stats-heading p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.pac-overview-panel {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
}
.pac-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.pac-metric-primary {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
  background: color-mix(in srgb, var(--accent-soft) 40%, var(--surface));
}
.pac-latest {
  margin-top: 14px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}
.pac-latest-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
}
.pac-latest-heading > strong {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.pac-latest-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
}
.pac-latest-grid > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.pac-latest-grid span,
.pac-latency-heading span {
  color: var(--muted);
  font-size: 11px;
}
.pac-latest-grid strong {
  font-size: 12px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.pac-no-latest {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.pac-latency-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  font-size: 12px;
}
.pac-latency-column > span {
  min-height: 14px;
  color: var(--muted);
  font-size: 9px;
  line-height: 14px;
  text-align: center;
  white-space: nowrap;
}
.pac-latency-column:nth-child(odd) > span {
  visibility: hidden;
}
.pac-latency-column:hover > span {
  visibility: visible;
}

.metric-card {
  min-width: 0;
  padding: 17px 16px 15px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.metric-label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
}
.metric-label :deep(.app-icon) {
  color: var(--accent);
}
.metric-value {
  font-size: clamp(1.45rem, 2.5vw, 1.9rem);
  line-height: 1.2;
  letter-spacing: -0.04em;
  overflow-wrap: anywhere;
}
.metric-value.value-warn {
  color: var(--warn);
}
.metric-note {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}
.monitor-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px;
  margin-bottom: 22px;
  box-shadow: var(--shadow);
  min-width: 0;
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}
.trend-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding-top: 14px;
  font-size: 11px;
  color: var(--muted);
}
.trend-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.request-swatch {
  background: var(--accent);
}
.error-swatch {
  background: var(--red);
}
.trend-sample-note {
  margin-left: auto;
}

.panel-heading h2 {
  margin: 0;
  font-size: 16px;
  letter-spacing: -0.02em;
}
.panel-heading p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.panel-count {
  flex: 0 0 auto;
  padding: 4px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11px;
  color: var(--muted);
  background: var(--surface-2);
}
.monitor-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition:
    filter 0.15s,
    opacity 0.15s;
}
.monitor-button:disabled {
  opacity: 1;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
  filter: none;
}
.monitor-button.secondary.is-loading:disabled {
  color: var(--text);
  -webkit-text-fill-color: var(--text);
  background: var(--surface);
  border-color: var(--line);
  cursor: progress;
}
.monitor-button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.monitor-button.secondary {
  color: var(--text);
  background: var(--surface);
}
.monitor-button.secondary:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: color-mix(in srgb, var(--accent) 36%, var(--line));
  color: var(--text);
  filter: none;
}
.monitor-button.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast);
  filter: none;
}
.monitor-button.primary:active:not(:disabled) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast);
}
.monitor-button.secondary:active:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.icon-spinning {
  animation: icon-spin 0.9s linear infinite;
}
@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}
.monitor-notice,
.probe-target {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.65;
  margin-bottom: 14px;
}
.monitor-notice strong {
  color: var(--text);
}
.access-filters {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) repeat(2, minmax(140px, 1fr)) auto;
  gap: 10px;
  align-items: end;
  margin: 0 0 14px;
}
.access-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.access-filter input,
.access-filter select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
}
.access-filter input:focus,
.access-filter select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.access-reset-wrap {
  display: flex;
  align-items: flex-end;
  min-width: 0;
}
.access-filter .select-field {
  display: flex;
  width: 100%;
}
.access-filter .select-field :deep(select) {
  width: 100%;
}
.access-filter-reset {
  min-height: 38px;
}
.access-filter-reset:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--accent) 12%, transparent);
}
.access-filter-reset:disabled {
  background: var(--surface-2);
  border: 1px dashed var(--line);
  color: var(--muted);
  opacity: 0.72;
  cursor: not-allowed;
  filter: none;
  box-shadow: none;
}
.table-scroll {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.monitor-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 850px;
}
.monitor-table th {
  padding: 11px 12px;
  color: var(--muted);
  background: var(--surface-2);
  text-align: left;
  font-weight: 700;
  white-space: nowrap;
  border-bottom: 1px solid var(--line);
}
.monitor-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
.monitor-table tbody tr:last-child td {
  border-bottom: 0;
}
.monitor-table tbody tr:hover {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.monitor-table code {
  max-width: 330px;
  display: inline-block;
  overflow-wrap: anywhere;
  white-space: normal;
}
.nowrap {
  white-space: nowrap;
}
.path-cell {
  min-width: 180px;
  max-width: 300px;
}
.ua-cell {
  max-width: 220px;
  min-width: 160px;
  color: var(--muted);
}
.path-cell code {
  word-break: break-all;
}
.method-label {
  display: inline-block;
  color: var(--muted);
  font-size: 10px;
  font-weight: 750;
  margin-right: 6px;
}
.category-pill,
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
}
.status-pill.good {
  color: var(--green);
  background: var(--green-soft);
  border-color: color-mix(in srgb, var(--green) 25%, var(--line));
}
.status-pill.bad {
  color: var(--red);
  background: var(--red-soft);
  border-color: color-mix(in srgb, var(--red) 25%, var(--line));
}
.status-pill.warn {
  color: var(--warn);
  background: var(--warn-soft);
  border-color: color-mix(in srgb, var(--warn) 25%, var(--line));
}
.panel-footnote {
  color: var(--muted);
  font-size: 11px;
  margin: 12px 0 0;
  line-height: 1.6;
}
.monitor-empty {
  padding: 26px 12px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  border: 1px dashed var(--line);
  border-radius: 10px;
}
.probe-target {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 0 0 16px;
}
.target-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
}
.probe-target-content {
  flex: 1;
  min-width: 0;
}
.probe-target-content > label {
  display: block;
  margin-bottom: 7px;
  color: var(--text);
  font-weight: 700;
}
.probe-target-controls {
  display: flex;
  align-items: stretch;
  gap: 9px;
}
.monitor-saved-state {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 5px;
  color: var(--green);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.probe-target-input {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}
.probe-target-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.probe-target-input:disabled {
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
  opacity: 1;
}
.probe-target-content p {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.probe-target-content code,
.probe-run-target code {
  overflow-wrap: anywhere;
  white-space: normal;
}
.probe-target-hint.is-warning {
  color: var(--warn);
}
.probe-target-message.is-success {
  color: var(--green);
}
.probe-target-message.is-error {
  color: var(--red);
}
.probe-run-target {
  margin: 0;
}
.probe-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.probe-run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.probe-run-head span {
  color: var(--muted);
}
.probe-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  min-width: 0;
}
.probe-card-top,
.probe-title {
  display: flex;
  align-items: center;
  gap: 9px;
}
.probe-card-top {
  justify-content: space-between;
}
.probe-title {
  min-width: 0;
  overflow-wrap: anywhere;
}
.probe-state-dot.is-good {
  background: var(--green);
}
.probe-state-dot.is-bad {
  background: var(--red);
}
.probe-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.probe-metrics div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--surface-2);
}
.probe-metrics span {
  color: var(--muted);
  font-size: 11px;
}
.probe-metrics strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.probe-detail,
.probe-error,
.probe-warning {
  font-size: 12px;
  margin: 10px 0 0;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.probe-error {
  color: var(--red);
}
.probe-warning {
  color: var(--warn);
}
.monitor-alert {
  padding: 10px 12px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.65;
  margin: 10px 0;
  overflow-wrap: anywhere;
}
.monitor-alert.is-error {
  border: 1px solid color-mix(in srgb, var(--red) 25%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
.monitor-alert.is-warning {
  border: 1px solid color-mix(in srgb, var(--warn) 25%, var(--line));
  background: var(--warn-soft);
  color: var(--warn);
}
.probe-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 12px;
}
.monitor-state {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  margin-bottom: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--muted);
}
.monitor-state strong {
  color: var(--text);
}
.monitor-state p {
  margin: 3px 0 0;
  font-size: 12px;
}
.monitor-state.is-error {
  justify-content: space-between;
  color: var(--red);
  border-color: color-mix(in srgb, var(--red) 25%, var(--line));
}
.monitor-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: monitor-spin 0.8s linear infinite;
  flex: 0 0 auto;
}
@keyframes monitor-spin {
  to {
    transform: rotate(360deg);
  }
}
.probe-history-error {
  min-width: 220px;
  max-width: 340px;
  overflow-wrap: anywhere;
  color: var(--red);
}
.access-row {
  cursor: pointer;
}
.access-row:hover {
  background: var(--surface-2);
}
.ua-preview {
  display: block;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 11px;
}
.access-detail-cell {
  text-align: center;
}
.access-detail-button {
  min-height: 32px;
  min-width: 32px;
  padding: 0 8px;
}
.access-detail-dialog {
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
.access-detail-dialog::backdrop {
  background: rgba(12, 16, 24, 0.45);
}
.access-detail-header {
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
.access-detail-kicker {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.access-detail-header h2 {
  margin: 0;
  font-size: 18px;
}
.access-detail-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
}
.access-detail-copy-state {
  margin: 0;
  padding: 8px 18px;
  color: var(--green);
  font-size: 12px;
}
.access-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 18px;
}
.access-detail-grid div {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.access-detail-grid span {
  color: var(--muted);
  font-size: 11px;
}
.access-detail-grid strong {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.access-detail-block {
  padding: 0 18px 14px;
}
.access-detail-block span {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.access-detail-block pre {
  margin: 0;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 220px;
  overflow: auto;
}
@media (max-width: 560px) {
  .access-detail-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 1100px) {
  .metric-grid,
  .pac-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .monitor-panel {
    padding: 16px;
  }
  .probe-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pac-latest-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .access-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .search-filter {
    grid-column: 1 / -1;
  }
  .access-filter-reset {
    justify-self: start;
  }
}
@media (max-width: 560px) {
  .access-filters {
    grid-template-columns: 1fr;
  }
  .search-filter {
    grid-column: auto;
  }
  .pac-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .pac-latest-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .pac-latest-heading,
  .pac-latency-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .probe-target-controls {
    flex-direction: column;
  }
  .probe-target-controls .monitor-button {
    align-self: flex-start;
  }
  .monitor-title-row {
    flex-direction: column;
  }
  .monitor-title-row .monitor-button {
    align-self: flex-start;
  }
  .panel-heading {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 12px;
  }
  .panel-actions {
    align-self: flex-start;
  }
  .panel-heading > .monitor-button {
    align-self: flex-start;
  }
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 14px 0 20px;
  }
  .metric-card {
    padding: 12px 11px;
    border-radius: 11px;
  }
  .metric-label {
    font-size: 10px;
  }
  .metric-value {
    font-size: 1.32rem;
  }
  .monitor-panel {
    padding: 13px;
    margin-bottom: 16px;
  }
  .trend-sample-note {
    margin-left: 0;
    flex-basis: 100%;
  }
  .probe-run-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .probe-metrics {
    gap: 7px;
  }
}

.panel-heading h2,
.overall-stats-heading h2 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.panel-heading h2 :deep(.app-icon),
.overall-stats-heading h2 :deep(.app-icon) {
  flex: 0 0 auto;
  color: var(--accent);
  opacity: 0.92;
}
.metric-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.metric-label :deep(.app-icon) {
  flex: 0 0 auto;
  opacity: 0.85;
}
.pac-latest-heading strong {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.trend-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 11px;
}
.legend-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 3px;
  vertical-align: middle;
}
.request-swatch {
  background: var(--accent);
}
.error-swatch {
  background: var(--red);
}
.trend-sample-note {
  color: var(--muted);
  opacity: 0.9;
}
.pac-latency-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 18px 0 10px;
  flex-wrap: wrap;
}
.pac-latency-heading strong {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}
.pac-latency-heading span {
  color: var(--muted);
  font-size: 11px;
}
@media (max-width: 560px) {
  .trend-legend {
    gap: 8px 12px;
    margin-top: 10px;
  }
}
</style>
