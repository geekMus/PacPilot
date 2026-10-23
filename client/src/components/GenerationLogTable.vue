<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { GenerationLog } from "@/api/client";
import AppIcon from "@/components/AppIcon.vue";
import TextDetail from "@/components/TextDetail.vue";
import AppDialog from "@/components/AppDialog.vue";
import { DialogDescription, DialogTitle } from "reka-ui";
import { computed, ref } from "vue";
import TableFrame from "@/components/TableFrame.vue";
import VirtualTable from "@/components/VirtualTable.vue";

const props = withDefaults(defineProps<{
  items: GenerationLog[];
  compact?: boolean;
  height?: number | string;
  hasMore?: boolean;
  loading?: boolean;
  error?: string;
  emptyText?: string;
  loadMore?: () => void | Promise<void>;
}>(), {
  compact: false,
  height: 480,
  hasMore: false,
  loading: false,
  error: "",
  emptyText: "",
  loadMore: () => undefined,
});
const { t, locale } = useI18n();
const selectedLog = ref<GenerationLog | null>(null);
const detailOpen = ref(false);
// The shared TableFrame measures actual rendered rows and treats height as a maximum.

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function modeLabel(mode: string): string {
  return mode === "remote" ? t("workflow.remoteMode") : mode === "custom" ? t("workflow.customMode") : mode;
}
function resultMessage(entry: GenerationLog): string {
  return entry.success ? t(`gen.success.${entry.result_code}`, entry.detail) : entry.error || t("common.failed");
}
function openRow(entry: GenerationLog): void { selectedLog.value = entry; detailOpen.value = true; }
function detailJson(entry: GenerationLog): string { return JSON.stringify(entry.detail ?? {}, null, 2); }
function message(entry: GenerationLog): string {
  const detail = entry.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    for (const key of ["message", "summary", "output", "result", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return JSON.stringify(detail);
  }
  return entry.error || (entry.success ? t("common.success") : t("common.failed"));
}

</script>

<template>
  <TableFrame v-if="compact" :height="height" min-width="600px" table-class="recent-table" :row-height="40">
    <template #columns>
      <col style="width: 118px" /><col style="width: 92px" /><col style="width: 100px" /><col style="width: 290px" />
    </template>
    <template #header><tr><th>{{ t("dashboard.colTime") }}</th><th>{{ t("dashboard.colResult") }}</th><th>{{ t("dashboard.colMode") }}</th><th>{{ t("dashboard.colMessage") }}</th></tr></template>
    <template #body>
      <tr v-for="entry in items" :key="entry.id" class="generation-log-row" tabindex="0" role="button" @click="openRow(entry)" @keydown.enter.prevent="openRow(entry)" @keydown.space.prevent="openRow(entry)">
        <td class="nowrap">{{ dateLabel(entry.created_at) }}</td>
        <td><span class="result-pill" :class="entry.success ? 'good' : 'bad'"><AppIcon :name="entry.success ? 'circle-check' : 'circle-x'" :size="13" />{{ entry.success ? t("common.success") : t("common.failed") }}</span></td>
        <td>{{ modeLabel(entry.mode) }}</td>
        <td class="log-message"><span @click.stop><TextDetail :text="message(entry)" :label="t('dashboard.genLogLabel')" /></span></td>
      </tr>
    </template>
  </TableFrame>
  <VirtualTable v-else :items="items" item-key="id" :col-span="4" :height="height" min-width="760px" table-class="generation-table" :row-height="48" :has-more="hasMore" :loading="loading" :error="error" :empty-text="emptyText" :load-more="loadMore">
    <template #columns><col style="width: 150px" /><col style="width: 110px" /><col style="width: 120px" /><col style="width: 360px" /></template>
    <template #header><tr><th>{{ t("settings.colTime") }}</th><th>{{ t("settings.colResult") }}</th><th>{{ t("settings.colMode") }}</th><th>{{ t("settings.colMessage") }}</th></tr></template>
    <template #row="{ item: entry }">
      <tr class="generation-log-row" tabindex="0" role="button" @click="openRow(entry)" @keydown.enter.prevent="openRow(entry)" @keydown.space.prevent="openRow(entry)">
        <td class="nowrap">{{ dateLabel(entry.created_at) }}</td>
        <td><span class="pill" :class="entry.success ? 'ok' : 'bad'">{{ entry.success ? t("common.success") : t("common.failed") }}</span></td>
        <td>{{ modeLabel(entry.mode) }}</td>
        <td class="msg"><span @click.stop><TextDetail :text="message(entry)" :label="t('settings.genLogInfo')" /></span></td>
      </tr>
    </template>
  </VirtualTable>
<AppDialog :open="detailOpen && !!selectedLog" :label="t('settings.genLogInfo')" width="min(720px, calc(100vw - 16px))" @update:open="detailOpen = $event">
  <template #header>
    <div class="generation-detail-heading">
      <p class="generation-detail-kicker">GENERATION LOG #{{ selectedLog?.id }}</p>
      <DialogTitle class="generation-detail-title">{{ t("settings.genLogInfo") }}</DialogTitle>
      <DialogDescription>{{ selectedLog ? dateLabel(selectedLog.created_at) : "" }}</DialogDescription>
    </div>
  </template>
  <template #body>
    <div v-if="selectedLog" class="generation-detail-content">
      <div class="generation-detail-grid">
        <div><span>{{ t("settings.colTime") }}</span><strong>{{ dateLabel(selectedLog.created_at) }}</strong></div>
        <div><span>{{ t("settings.colResult") }}</span><strong><span class="generation-detail-status" :class="selectedLog.success ? 'succeeded' : 'failed'"><AppIcon :name="selectedLog.success ? 'circle-check' : 'circle-x'" :size="13" />{{ selectedLog.success ? t("common.success") : t("common.failed") }}</span></strong></div>
        <div><span>{{ t("settings.colMode") }}</span><strong>{{ modeLabel(selectedLog.mode) }}</strong></div>
        <div><span>ID</span><strong>#{{ selectedLog.id }}</strong></div>
        <div><span>Result code</span><strong><code>{{ selectedLog.result_code || "—" }}</code></strong></div>
      </div>
      <section class="generation-detail-section">
        <h3>{{ t("settings.colMessage") }}</h3>
        <pre>{{ resultMessage(selectedLog) }}</pre>
      </section>
      <section class="generation-detail-section">
        <h3>{{ t("common.details") }}</h3>
        <pre>{{ detailJson(selectedLog) }}</pre>
      </section>
      <section v-if="selectedLog.error" class="generation-detail-section generation-detail-error">
        <h3>{{ t("common.failed") }}</h3><pre>{{ selectedLog.error }}</pre>
      </section>
    </div>
  </template>
</AppDialog>
</template>

<style scoped>
.generation-log-row { cursor: pointer; outline-offset: -2px; }
.generation-log-row:focus-visible { outline: 2px solid var(--accent); }
.generation-detail-kicker { margin: 0 0 5px; color: var(--muted); font-size: 10px; font-weight: 800; letter-spacing: .08em; }
.generation-detail-title { display: block; margin-bottom: 4px; font-size: 17px; font-weight: 750; }
.generation-detail-content { display: grid; gap: 18px; min-width: 0; }
.generation-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.generation-detail-grid > div { display: grid; gap: 6px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
.generation-detail-grid > div > span:first-child { color: var(--muted); font-size: 11px; }
.generation-detail-grid strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.generation-detail-status { display: inline-flex; align-items: center; gap: 6px; }
.generation-detail-status.succeeded { color: var(--green); }
.generation-detail-status.failed { color: var(--red); }
.generation-detail-section { display: grid; gap: 8px; min-width: 0; }
.generation-detail-section h3 { margin: 0; font-size: 13px; }
.generation-detail-section pre { margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 var(--font-mono); }
.generation-detail-error pre { border-color: color-mix(in srgb, var(--red) 25%, var(--line)); background: var(--red-soft); color: var(--red); }
@media (max-width: 520px) { .generation-detail-grid { grid-template-columns: 1fr; } }
</style>
