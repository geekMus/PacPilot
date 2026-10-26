<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import { PROJECT_LINKS } from "@shared/project-links";

// 版本弹窗按需加载：它依赖 reka-ui 的 Dialog/FocusScope/DismissableLayer，整块约 32KB（gzip），
// 而这枚弹窗只有用户点击版本号时才会用到。若静态引入，每个页面首屏都要先下载它。
const AppVersionDialog = defineAsyncComponent(() => import("@/components/AppVersionDialog.vue"));

const { t } = useI18n();
const projectUrl = PROJECT_LINKS.repository;
const packageJsonUrl = PROJECT_LINKS.packageJsonProxy;
// 版本号由构建期 vite define 注入，避免把整个 package.json 打进客户端产物。
const currentVersion = ref(__APP_VERSION__);
interface UpdateInfo {
  latestVersion: string | null;
  updateAvailable: boolean;
  checked: boolean;
  repositoryUrl: string;
}
interface CalendarVersion {
  date: string;
  revision: number;
}
const updateInfo = ref<UpdateInfo | null>(null);
const dialogOpen = ref(false);
const pendingVersionRequests = ref(0);
const isCheckingVersion = computed(() => pendingVersionRequests.value > 0);
const refreshFailed = ref(false);
const hasUpdate = computed(() =>
  Boolean(updateInfo.value?.updateAvailable && updateInfo.value.latestVersion)
);
const latestVersion = computed(
  () => updateInfo.value?.latestVersion || t("common.temporarilyUnknown")
);
let requestSequence = 0;

function parseCalendarVersion(value: string): CalendarVersion | null {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})(?:-r([1-9]\d*))?$/.exec(value);
  if (!match) return null;
  const year = match[1];
  const month = match[2];
  const day = match[3];
  const revisionText = match[4];
  const date = new Date(year + "-" + month + "-" + day + "T00:00:00.000Z");
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== year + "-" + month + "-" + day
  )
    return null;
  return {
    date: year + "." + month + "." + day,
    revision: revisionText ? Number(revisionText) : 0,
  };
}

function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseCalendarVersion(candidate);
  const installed = parseCalendarVersion(current);
  if (!next || !installed) return false;
  if (next.date !== installed.date) return next.date > installed.date;
  return next.revision > installed.revision;
}

function openVersionDialog(): void {
  // 版本信息只在页面挂载时自动查询；打开弹窗仅展示已有结果。
  // 后续只有用户点击“最新版本”时才会再次请求。
  dialogOpen.value = true;
}

async function loadVersionInfo(): Promise<void> {
  const requestId = ++requestSequence;
  pendingVersionRequests.value += 1;
  refreshFailed.value = false;
  updateInfo.value = null;

  try {
    // 每次触发都由用户浏览器直连指定代理 URL；唯一参数与 no-store 用于尽量避开旧缓存。
    // 只发送 CORS 安全列出的 Accept 头，避免额外请求头触发预检请求。
    const sourceUrl = new URL(packageJsonUrl);
    sourceUrl.searchParams.set("_cacheBust", String(Date.now()) + "-" + String(requestId));
    const response = await fetch(sourceUrl.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(t("footerExtra.k0") + " " + response.status);

    const data = (await response.json()) as { version?: unknown };
    const version = typeof data.version === "string" ? data.version.trim() : "";
    if (!parseCalendarVersion(version)) throw new Error(t("footerExtra.k1"));

    // 并发刷新时只采用最近一次触发的结果，避免较早的响应覆盖较新的查询结果。
    if (requestId === requestSequence) {
      updateInfo.value = {
        latestVersion: version,
        updateAvailable: isNewerVersion(version, currentVersion.value),
        checked: true,
        repositoryUrl: projectUrl,
      };
      refreshFailed.value = false;
    }
  } catch {
    if (requestId === requestSequence) {
      updateInfo.value = null;
      refreshFailed.value = true;
    }
  } finally {
    pendingVersionRequests.value = Math.max(0, pendingVersionRequests.value - 1);
  }
}

onMounted(() => {
  void loadVersionInfo();
  // 页面空闲后再取弹窗代码，用户点击版本号时已经就绪；不占用首屏带宽。
  const prefetch = (): void => {
    void import("@/components/AppVersionDialog.vue").catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === "function")
    window.requestIdleCallback(prefetch, { timeout: 3000 });
  else window.setTimeout(prefetch, 2000);
});
</script>
<template>
  <footer class="app-footer">
    <div class="footer-project">
      <a
        class="github-project-link"
        :href="projectUrl"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('footer.openGithub')"
        :title="t('footer.githubTitle')"
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.04c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3.01 0 4.27-2.6 5.21-5.08 5.49.4.35.75 1.02.75 2.06V22c0 .29.2.64.76.53A11.1 11.1 0 0 0 12 .9Z"
          /></svg
        ><span>{{ t("footer.github") }}</span>
      </a>
      <button
        type="button"
        class="version-badge"
        :class="{ 'is-update': hasUpdate }"
        @click="openVersionDialog"
        :aria-label="hasUpdate ? t('footer.viewUpdate') : t('footer.viewVersion')"
      >
        <span>v{{ currentVersion }}</span
        ><span v-if="hasUpdate" class="new-badge">{{ t("footer.newBadge") }}</span>
      </button>
    </div>
    <AppVersionDialog
      v-if="dialogOpen"
      :open="dialogOpen"
      :current-version="currentVersion"
      :latest-version="latestVersion"
      :has-update="hasUpdate"
      :is-checking="isCheckingVersion"
      :refresh-failed="refreshFailed"
      :checked="Boolean(updateInfo?.checked)"
      :repository-url="updateInfo?.repositoryUrl || projectUrl"
      @update:open="dialogOpen = $event"
      @refresh="loadVersionInfo"
    />
  </footer>
</template>
<style>
@reference "@/styles/tailwind.css";

.app-footer {
  @apply flex items-center justify-start gap-3.5 mt-7 border-t px-0.5 pt-3.5 pb-1 text-xs;
  border-color: var(--line);
  color: var(--muted);
}
.footer-project {
  @apply flex items-center gap-3;
}
.github-project-link {
  @apply inline-flex items-center justify-center gap-[7px] rounded-full border px-[11px] font-semibold no-underline transition-colors;
  min-height: 34px;
  border-color: var(--line);
  color: var(--text);
  background: var(--surface);
}
.github-project-link:hover {
  @apply -translate-y-px;
  color: var(--accent);
  border-color: var(--accent);
  background: var(--surface-2);
}
.github-project-link:active {
  @apply translate-y-0;
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.version-badge {
  @apply relative inline-flex items-center rounded-full border px-3 text-xs font-bold tabular-nums cursor-pointer transition-transform;
  min-height: 31px;
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}
.version-badge:hover {
  @apply -translate-y-px;
  box-shadow: var(--shadow);
}
.version-badge:active {
  @apply translate-y-0;
  box-shadow: var(--shadow-sm);
}
.version-badge.is-update {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
  background: var(--warn-soft);
  color: var(--text);
}
.new-badge {
  @apply absolute -top-2 -right-2.5 rounded-full border-2 px-[5px] py-0.5 text-[9px] font-extrabold leading-[1.15];
  border-color: var(--surface);
  background: var(--warn);
  color: var(--accent-contrast);
  letter-spacing: 0.02em;
}
@media (max-width: 560px) {
  .app-footer {
    @apply mt-[22px] flex-col items-start pt-3;
  }
}
</style>
