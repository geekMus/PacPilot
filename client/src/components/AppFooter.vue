<script setup lang="ts">
import { useI18n } from "vue-i18n";

import { computed, onMounted, ref } from "vue";
import packageJson from "../../../package.json";
import AppIcon from "./AppIcon.vue";


const { t } = useI18n();

const projectUrl = "https://github.com/geekMus/genpac-runner";
const packageJsonUrl =
  "https://github.mus.pp.ua/https://raw.githubusercontent.com/geekMus/genpac-runner/refs/heads/main/package.json";
const currentVersion = ref(String(packageJson.version));
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
const latestVersion = computed(() => updateInfo.value?.latestVersion || t("common.temporarilyUnknown"));
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
});
</script>