<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppDialog from "@/components/AppDialog.vue";
import { DialogDescription, DialogTitle } from "reka-ui";

/**
 * 「项目版本」弹窗。
 *
 * 这里单独成组件并被 `AppFooter` 异步加载，是因为 reka-ui 的 Dialog/FocusScope/
 * DismissableLayer 相当可观（gzip 后约 32KB）。此前它随页脚静态进入每个页面的
 * 关键路径，而这枚弹窗只有用户点击版本号时才用得上；拆出来后首屏只下载页脚本身。
 * 版本查询与状态仍由 `AppFooter` 持有，本组件只负责呈现与转发用户操作。
 */
const props = defineProps<{
  open: boolean;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isChecking: boolean;
  refreshFailed: boolean;
  checked: boolean;
  repositoryUrl: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  refresh: [];
}>();

const { t } = useI18n();
</script>
<template>
  <AppDialog
    :open="props.open"
    :label="t('footer.projectVersion')"
    width="min(640px, calc(100vw - 24px))"
    :close-label="t('common.closeDialog')"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="version-dialog-heading">
        <DialogTitle id="version-dialog-title" class="version-dialog-title">{{
          t("footer.projectVersion")
        }}</DialogTitle>
        <DialogDescription id="version-dialog-description" class="app-dialog-visually-hidden">
          {{ t("footer.currentVersion") }}、{{ t("footer.latestVersion") }}
        </DialogDescription>
      </div>
    </template>
    <template #body>
      <div class="version-grid">
        <div class="version-item">
          <span>{{ t("footer.currentVersion") }}</span
          ><strong>v{{ props.currentVersion }}</strong>
        </div>
        <button
          type="button"
          class="version-item latest-version-item"
          :class="{ 'version-new': props.hasUpdate, 'is-loading': props.isChecking }"
          @click="emit('refresh')"
          :disabled="props.isChecking"
          :title="props.isChecking ? t('footer.checkingVersion') : t('footer.queryLatest')"
          :aria-label="props.isChecking ? t('footer.checkingLatest') : t('footer.clickGetLatest')"
        >
          <span
            >{{ t("footer.latestVersion") }}
            <small>{{ props.isChecking ? t("common.getting") : t("common.clickRefresh") }}</small></span
          ><strong>{{
            props.latestVersion === t("common.temporarilyUnknown")
              ? props.latestVersion
              : "v" + props.latestVersion
          }}</strong>
        </button>
      </div>
      <div v-if="props.hasUpdate" class="dialog-update-note" role="status">
        <span class="dialog-update-dot"></span>
        <div>
          <strong>{{ t("footer.foundNew", { version: props.latestVersion }) }}</strong>
          <p>{{ t("footer.outdated") }}</p>
        </div>
      </div>
      <p v-else-if="props.isChecking" class="dialog-status" role="status">
        {{ t("footer.checkingStatus") }}
      </p>
      <p v-else-if="props.refreshFailed" class="dialog-status" role="status">
        {{ t("footer.fetchFailed") }}
      </p>
      <p v-else-if="props.checked" class="dialog-status">
        {{ t("footer.alreadyLatest") }}
      </p>
      <p v-else class="dialog-status">{{ t("footerExtra.k2") }}</p>
    </template>
    <template #footer>
      <a
        class="app-button app-button--primary"
        :href="props.repositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.04c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3.01 0 4.27-2.6 5.21-5.08 5.49.4.35.75 1.02.75 2.06V22c0 .29.2.64.76.53A11.1 11.1 0 0 0 12 .9Z"
          /></svg
        >{{ t("footerExtra.k3") }}</a
      ><button
        type="button"
        class="app-button app-button--secondary"
        @click="emit('update:open', false)"
      >
        {{ t("footerExtra.k4") }}
      </button>
    </template>
  </AppDialog>
</template>
<style>
@reference "@/styles/tailwind.css";

.version-dialog-title {
  @apply m-0 text-xl tracking-tight;
}
.version-grid {
  @apply mb-4 grid grid-cols-2 gap-2.5;
}
.version-item {
  @apply flex min-w-0 flex-col gap-[7px] rounded-xl border p-3.5;
  border-color: var(--line);
  background: var(--surface-2);
}
.version-item span {
  @apply text-[11px];
  color: var(--muted);
}
.version-item strong {
  @apply text-[15px] tabular-nums;
  overflow-wrap: anywhere;
}
.latest-version-item {
  @apply w-full cursor-pointer border text-left transition-colors;
  border-color: var(--line);
  color: var(--text);
}
.latest-version-item:hover:not(:disabled) {
  border-color: var(--accent);
}
.latest-version-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.latest-version-item:disabled {
  @apply cursor-not-allowed;
  color: var(--control-disabled-text);
  border-color: var(--control-disabled-border);
  background: var(--control-disabled-bg);
}
.latest-version-item.is-loading:disabled {
  @apply cursor-progress;
  color: var(--text);
  -webkit-text-fill-color: var(--text);
  border-color: var(--line);
  background: var(--surface);
}
.latest-version-item span small {
  @apply ml-1 text-[10px] font-semibold;
  color: var(--accent);
}
.version-item.version-new {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
  background: var(--warn-soft);
  color: var(--text);
}
.dialog-update-note {
  @apply mt-3.5 flex items-start gap-2.5 rounded-xl border p-3;
  border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
  background: var(--warn-soft);
  color: var(--text);
}
.dialog-update-dot {
  @apply mt-[5px] h-2 w-2 shrink-0 rounded-full;
  background: var(--warn);
}
.dialog-update-note strong {
  @apply text-[13px];
}
.dialog-update-note p {
  @apply mt-1 text-xs leading-normal;
  color: var(--muted);
}
.dialog-status {
  @apply mt-3.5 text-xs leading-normal;
  color: var(--muted);
}
</style>
