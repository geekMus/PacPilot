<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { GenerationLog } from "@/api/client";
import AppIcon from "@/components/AppIcon.vue";
import TextDetail from "@/components/TextDetail.vue";
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
const emit = defineEmits<{ rowClick: [entry: GenerationLog] }>();
const { t, locale } = useI18n();

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, { dateStyle: "short", timeStyle: "short" }).format(date);
}
function modeLabel(mode: string): string {
  return mode === "remote" ? t("dashboard.remoteRuleList") : t("dashboard.customRulesLabel");
}
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
function openRow(entry: GenerationLog): void { emit("rowClick", entry); }
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
        <td class="log-message"><span @click.stop><TextDetail :text="message(entry)" :label="t("dashboard.genLogLabel")" /></span></td>
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
        <td class="msg"><span @click.stop><TextDetail :text="message(entry)" :label="t("settings.genLogInfo")" /></span></td>
      </tr>
    </template>
  </VirtualTable>
</template>

<style scoped>
.generation-log-row { cursor: pointer; }
.generation-log-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
