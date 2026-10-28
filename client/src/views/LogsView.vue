<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useMonitoringDashboard } from "@/composables/useMonitoringDashboard";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppDialog from "@/components/AppDialog.vue";
import AppSelect from "@/components/AppSelect.vue";
import AppInput from "@/components/AppInput.vue";
import JsonTreeView from "@/components/JsonTreeView.vue";
import { DialogDescription, DialogTitle } from "reka-ui";
import AppFooter from "@/components/AppFooter.vue";
import VirtualTable from "@/components/VirtualTable.vue";

const { t } = useI18n();
const {
  accesses,
  accessHasMore,
  accessLoadingMore,
  accessLoadError,
  accessTotal,
  accessKeyword,
  accessCategory,
  accessStatus,
  selectedAccess,
  accessDetailOpen,
  accessCopyState,
  openAccessDetail,
  onAccessDetailOpenChange,
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
  error: monitorError,
} = useMonitoringDashboard();

// 请求头是 JSON 字符串；解析成功且非空时用彩色 JSON 树展示，
// 否则回退到纯文本（含「无请求头」等占位文案）。
const requestHeadersJson = computed(() => {
  const raw = selectedAccess.value?.request_headers;
  if (!raw || !String(raw).trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
});
</script>

<template>
  <AdminLayout active="logs" :title="t('nav.logs')" :subtitle="t('logs.subtitle')">
    <div class="monitor-page logs-page">
      <div v-if="monitorError" class="monitor-alert is-error" role="alert">{{ monitorError }}</div>

      <section class="monitor-panel">
        <div class="panel-heading">
          <div>
            <h2><AppIcon name="list-checks" :size="17" />{{ t("logs.accessTitle") }}</h2>
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
            <AppInput
              v-model="accessKeyword"
              type="search"
              :placeholder="t('monitor.k34')"
              autocomplete="off"
            />
          </label>
          <label class="access-filter">
            <span>{{ t("monitor.k117") }}</span>
            <AppSelect
              v-model="accessCategory"
              block
              :options="[
                { value: 'all', label: t('monitor.k118') },
                { value: 'pac', label: t('monitor.k10') },
                { value: 'page', label: t('monitor.k9') },
                { value: 'public-api', label: t('monitor.k11') },
                { value: 'admin-api', label: t('monitor.k12') },
              ]"
            />
          </label>
          <label class="access-filter">
            <span>{{ t("monitor.k119") }}</span>
            <AppSelect
              v-model="accessStatus"
              block
              :options="[
                { value: 'all', label: t('monitor.k120') },
                { value: 'success', label: t('monitor.k121') },
                { value: 'redirect', label: t('monitor.k122') },
                { value: 'client-error', label: t('monitor.k123') },
                { value: 'server-error', label: t('monitor.k124') },
              ]"
            />
          </label>
          <div
            class="access-reset-wrap"
            :title="hasAccessFilters ? t('monitor.k35') : t('monitor.k36')"
          >
            <button
              class="app-button app-button--secondary access-filter-reset"
              type="button"
              :disabled="!hasAccessFilters"
              @click="resetAccessFilters"
            >
              <AppIcon name="x" :size="14" />{{ t("monitor.k125") }}
            </button>
          </div>
        </div>

        <VirtualTable
          :items="filteredAccesses"
          item-key="id"
          :col-span="8"
          :row-height="58"
          height="520px"
          fixed-height
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
            <tr
              class="access-row"
              tabindex="0"
              role="button"
              :title="t('monitor.k38')"
              @click="openAccessDetail(event)"
              @keydown.enter.prevent="openAccessDetail(event)"
              @keydown.space.prevent="openAccessDetail(event)"
            >
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

      <AppDialog
        :open="accessDetailOpen && !!selectedAccess"
        :label="t('monitor.k39')"
        width="min(640px, calc(100vw - 16px))"
        body-class="access-detail-dialog-body"
        :close-label="t('monitor.k40')"
        @update:open="onAccessDetailOpenChange"
      >
        <template #header>
          <div class="access-detail-heading">
            <p class="access-detail-kicker">{{ t("logs.kicker") }} #{{ selectedAccess?.id }}</p>
            <DialogTitle class="access-detail-title">{{ t("monitor.k135") }}</DialogTitle>
            <DialogDescription class="app-dialog-visually-hidden">
              {{ t("monitor.k138") }}、{{ t("monitor.k139") }}、{{ t("monitor.k142") }}
            </DialogDescription>
          </div>
        </template>
        <template #header-actions>
          <button
            class="app-button app-button--secondary access-detail-copy"
            :class="{
              'is-copy-success': accessCopyState === 'success',
              'is-copy-error': accessCopyState === 'error',
            }"
            type="button"
            aria-live="polite"
            @click="copyAccessDetail"
          >
            <AppIcon
              :name="
                accessCopyState === 'success'
                  ? 'circle-check'
                  : accessCopyState === 'error'
                    ? 'circle-x'
                    : 'copy'
              "
              :size="14"
            />
            {{
              accessCopyState === "success"
                ? t("common.copiedShort")
                : accessCopyState === "error"
                  ? t("common.copyFailed")
                  : t("monitor.k136")
            }}
          </button>
        </template>
        <template #body>
          <div v-if="selectedAccess" class="access-detail-content">
            <div class="access-detail-grid">
              <div>
                <span>{{ t("monitor.k127") }}</span>
                <strong>{{ formatDate(selectedAccess.created_at) }}</strong>
              </div>
              <div>
                <span>{{ t("monitor.k137") }}</span>
                <strong
                  ><code>{{ selectedAccess.method }}</code></strong
                >
              </div>
              <div>
                <span>{{ t("monitor.k129") }}</span>
                <strong>{{ categoryLabel(selectedAccess.category) }}</strong>
              </div>
              <div>
                <span>{{ t("monitor.k131") }}</span>
                <strong>
                  {{ selectedAccess.status_code }} {{ statusLabel(selectedAccess.status_code) }}
                </strong>
              </div>
              <div>
                <span>{{ t("monitor.k132") }}</span>
                <strong>{{ formatDuration(selectedAccess.duration_ms) }}</strong>
              </div>
              <div>
                <span>{{ t("monitor.k133") }}</span>
                <strong>{{ formatBytes(selectedAccess.response_bytes) }}</strong>
              </div>
              <div>
                <span>{{ t("monitor.k128") }}</span>
                <strong
                  ><code>{{ selectedAccess.source_ip || "unknown" }}</code></strong
                >
              </div>
              <div>
                <span>{{ t("monitor.k143") }}</span>
                <strong
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
              <span>{{ t("monitor.k144") }}</span>
              <pre>{{ selectedAccess.referer || t("monitor.k2") }}</pre>
            </div>
            <div class="access-detail-block">
              <span>{{ t("monitor.k145") }} / {{ t("monitor.k146") }}</span>
              <pre
                >{{ selectedAccess.accept || t("monitor.k2") }}
{{ selectedAccess.accept_language || t("monitor.k2") }}</pre>
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
              <JsonTreeView v-if="requestHeadersJson !== undefined" :data="requestHeadersJson" />
              <pre v-else>{{ formatAccessHeaders(selectedAccess.request_headers) }}</pre>
            </div>
          </div>
        </template>
      </AppDialog>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped src="@/views/MonitoringView.css"></style>
