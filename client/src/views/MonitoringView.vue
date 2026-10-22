<script setup lang="ts">
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import ResponsiveTrendChart from "../components/ResponsiveTrendChart.vue";
import VirtualTable from "../components/VirtualTable.vue";
import SelectField from "../components/SelectField.vue";
import { useMonitoringDashboard } from "../composables/useMonitoringDashboard";

const {
  t,
  summary,
  accesses,
  accessHasMore,
  accessLoadingMore,
  accessLoadError,
  accessTotal,
  loading,
  authChecking,
  refreshing,
  error,
  refreshError,
  lastUpdated,
  timeZone,
  latestPacRequest,
  accessKeyword,
  accessCategory,
  accessStatus,
  selectedAccess,
  accessDetailDialog,
  accessCopyState,
  openAccessDetail,
  closeAccessDetail,
  onAccessDetailClose,
  handleAccessDetailBackdrop,
  formatAccessHeaders,
  copyAccessDetail,
  filteredAccesses,
  hasAccessFilters,
  resetAccessFilters,
  loadMoreAccesses,
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

        <section class="monitor-panel pac-overview-panel" aria-labelledby="pac-overview-title">
          <div class="panel-heading">
            <div>
              <h2 id="pac-overview-title">
                <AppIcon name="route" :size="17" />{{ t("monitor.k66") }}
              </h2>
              <p>{{ t("monitor.k67") }} <code>/proxy.pac</code> {{ t("monitor.k68") }}</p>
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

        <div class="overall-stats-heading">
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

        <section class="monitor-panel">
          <div class="panel-heading">
            <div>
              <h2><AppIcon name="list-checks" :size="17" />{{ t("monitor.k112") }}</h2>
              <p>{{ t("monitor.k113") }}</p>
            </div>
            <div class="panel-actions">
              <span class="panel-count">{{
                t("monitor.matchCount", {
                  filtered: filteredAccesses.length,
                  total: accesses.length,
                })
              }}</span>
            </div>
          </div>

          <div class="monitor-notice">
            <strong>{{ t("monitor.k114") }}</strong
            >{{ t("monitor.k115") }}
          </div>

          <div class="access-filters" :aria-label="t('monitor.k33')">
            <label class="access-filter search-filter">
              <span>{{ t("monitor.k116") }}</span>
              <input
                v-model="accessKeyword"
                type="search"
                :placeholder="t('monitor.k34')"
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
              :title="hasAccessFilters ? t('monitor.k35') : t('monitor.k36')"
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
              <tr class="access-row" :title="t('monitor.k38')" @click="openAccessDetail(event)">
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
          :aria-label="t('monitor.k39')"
          @click="handleAccessDetailBackdrop"
          @close="onAccessDetailClose"
        >
          <header class="access-detail-header">
            <div>
              <p class="access-detail-kicker">ACCESS LOG #{{ selectedAccess.id }}</p>
              <h2>{{ t("monitor.k135") }}</h2>
            </div>
            <div class="access-detail-actions">
              <button
                class="monitor-button secondary"
                :class="{ 'is-copy-success': accessCopyState === 'success', 'is-copy-error': accessCopyState === 'error' }"
                type="button"
                aria-live="polite"
                @click="copyAccessDetail"
              >
                <AppIcon
                  :name="accessCopyState === 'success' ? 'circle-check' : accessCopyState === 'error' ? 'circle-x' : 'copy'"
                  :size="14"
                />{{ accessCopyState === 'success' ? t("common.copiedShort") : accessCopyState === 'error' ? t("common.copyFailed") : t("monitor.k136") }}
              </button>
              <button
                class="monitor-button secondary"
                type="button"
                :aria-label="t('monitor.k40')"
                @click="closeAccessDetail"
              >
                <AppIcon name="x" :size="14" />
              </button>
            </div>
          </header>
          <div class="access-detail-grid">
            <div>
              <span>{{ t("monitor.k127") }}</span
              ><strong>{{ formatDate(selectedAccess.created_at) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k137") }}</span
              ><strong
                ><code>{{ selectedAccess.method }}</code></strong
              >
            </div>
            <div>
              <span>{{ t("monitor.k129") }}</span
              ><strong>{{ categoryLabel(selectedAccess.category) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k131") }}</span
              ><strong
                >{{ selectedAccess.status_code }}
                {{ statusLabel(selectedAccess.status_code) }}</strong
              >
            </div>
            <div>
              <span>{{ t("monitor.k132") }}</span
              ><strong>{{ formatDuration(selectedAccess.duration_ms) }}</strong>
            </div>
            <div>
              <span>{{ t("monitor.k133") }}</span
              ><strong>{{ formatBytes(selectedAccess.response_bytes) }}</strong>
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
      </template>

      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped src="./MonitoringView.css"></style>
