<script setup lang="ts">
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppFooter from "@/components/AppFooter.vue";
import ResponsiveTrendChart from "@/components/ResponsiveTrendChart.vue";
import { useMonitoringDashboard } from "@/composables/useMonitoringDashboard";
import { resolveApiUrl } from "@/api/runtime-config";

// The PAC endpoint lives on the backend host, which may differ from the
// static frontend host in split deployments. Resolved lazily so it reflects
// the loaded runtime config.
const pacUrl = () => resolveApiUrl("/pac");

const {
  t,
  summary,
  loading,
  authChecking,
  refreshing,
  error,
  refreshError,
  lastUpdated,
  timeZone,
  latestPacRequest,
  formatDate,
  formatDuration,
  formatBytes,
  categoryLabel,
  statusLabel,
  statusTone,
} = useMonitoringDashboard();
</script>

<template>
  <AdminLayout active="monitor" :title="t('monitor.k24')" :subtitle="t('monitor.k25')">
    <template #actions>
      <span v-if="lastUpdated" class="monitor-top-updated">
        <span class="live-dot" :class="{ busy: refreshing }"></span>
        {{ t("monitor.updatedAt", { time: formatDate(lastUpdated) }) }}
      </span>
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
      </section>

      <template v-else>
        <div v-if="error" class="monitor-alert is-error" role="alert">{{ error }}</div>
        <div v-if="refreshError" class="monitor-alert is-warning" role="status">
          {{ t("monitor.autoRefreshError", { error: refreshError }) }}
        </div>

        <div id="overall-stats" class="overall-stats-heading">
          <h2><AppIcon name="activity" :size="17" />{{ t("monitor.k31") }}</h2>
          <p>{{ t("monitor.k91") }}</p>
        </div>
        <section class="metric-grid" :aria-label="t('monitor.k31')">
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="activity" :size="15" />{{ t("monitor.k92") }}</span
            >
            <strong class="metric-value">{{ summary?.activeRequests ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k93") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="network" :size="15" />{{ t("monitor.k94") }}</span
            >
            <strong class="metric-value">{{ summary?.tcpConnections ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k95") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="clock" :size="15" />{{ t("monitor.k96") }}</span
            >
            <strong class="metric-value">{{ summary?.requestsLastHour ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k97") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="globe" :size="15" />{{ t("monitor.k98") }}</span
            >
            <strong class="metric-value">{{ summary?.uniqueSourcesLast24h ?? 0 }}</strong>
            <span class="metric-note">{{ t("monitor.k99") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="chart" :size="15" />{{ t("monitor.k100") }}</span
            >
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
            <span class="metric-label"
              ><AppIcon name="timer" :size="15" />{{ t("monitor.k103") }}</span
            >
            <strong class="metric-value">{{ formatDuration(summary?.averageResponseMs) }}</strong>
            <span class="metric-note">{{ t("monitor.k76") }}</span>
          </article>
          <article class="metric-card">
            <span class="metric-label"
              ><AppIcon name="gauge" :size="15" />{{ t("monitor.k104") }}</span
            >
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
            <span class="panel-count">{{
              t("monitor.peakPerHour", {
                n: Math.max(0, ...(summary?.requestTrend ?? []).map((item) => item.requests)),
              })
            }}</span>
          </div>
          <ResponsiveTrendChart
            v-if="summary?.requestTrend?.length"
            mode="count"
            :points="summary.requestTrend"
            :time-zone="timeZone"
            :aria-label="t('monitor.k32')"
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

        <section class="monitor-panel pac-overview-panel" aria-labelledby="pac-overview-title">
          <div class="panel-heading">
            <div>
              <h2 id="pac-overview-title">
                <AppIcon name="route" :size="17" />{{ t("monitor.k66") }}
              </h2>
              <p>
                {{ t("monitor.k67") }} <code>{{ pacUrl() }}</code> {{ t("monitor.k68") }}
              </p>
            </div>
            <span class="panel-count">{{ t("monitor.k69") }}</span>
          </div>

          <div class="pac-metric-grid">
            <article class="metric-card pac-metric-primary">
              <span class="metric-label"
                ><AppIcon name="route" :size="15" />{{ t("monitor.k70") }}</span
              >
              <strong class="metric-value">{{ summary?.pacRequestsLast24h ?? 0 }}</strong>
              <span class="metric-note">{{
                t("monitor.lastHourCount", { n: summary?.pacRequestsLastHour ?? 0 })
              }}</span>
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
              <span class="metric-label"
                ><AppIcon name="timer" :size="15" />{{ t("monitor.k75") }}</span
              >
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
                <span>{{ t("monitor.k78") }}</span
                ><strong>{{ formatDate(latestPacRequest.created_at) }}</strong>
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
              {{ t("monitor.k81") }} <code>{{ pacUrl() }}</code> {{ t("monitor.k82") }}
            </div>
          </div>
        </section>
        <section id="pac-trends" class="monitor-panel pac-trend-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="chart" :size="17" />{{ t("monitor.k83") }}</h2>
              <p>
                {{ t("monitor.k84") }}
              </p>
            </div>
            <span class="panel-count">{{
              t("monitor.peakPerHour", {
                n: Math.max(0, ...(summary?.pacRequestTrend ?? []).map((item) => item.requests)),
              })
            }}</span>
          </div>
          <ResponsiveTrendChart
            v-if="(summary?.pacRequestsLast24h ?? 0) > 0"
            mode="count"
            :points="summary!.pacRequestTrend"
            :time-zone="timeZone"
            :aria-label="t('monitor.k29')"
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
            :aria-label="t('monitor.k30')"
          />
          <div v-else class="pac-no-latest">
            {{ t("monitor.k90") }}
          </div>
        </section>
      </template>

      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped src="@/views/MonitoringView.css"></style>
