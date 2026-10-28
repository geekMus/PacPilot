import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { api, type AccessEvent, type AdminSession, type MonitorSummary } from "@/api/client";
import { useCopyFeedback } from "@/composables/useCopyFeedback";
import { fetchAdminSession } from "@/composables/useAdminSession";

export function useMonitoringDashboard() {
  const { t, locale } = useI18n();

  const router = useRouter();

  const summary = ref<MonitorSummary | null>(null);

  const accesses = ref<AccessEvent[]>([]);

  const accessHasMore = ref(false);

  const accessLoadingMore = ref(false);

  const accessLoadError = ref("");

  const accessTotal = ref(0);

  const loading = ref(true);

  const authChecking = ref(true);

  const refreshing = ref(false);

  const error = ref("");

  const refreshError = ref("");

  const lastUpdated = ref("");

  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const timeZone = computed(() => summary.value?.timezone || "Asia/Shanghai");

  const latestPacRequest = computed(() => summary.value?.latestPacRequest ?? null);

  // 访问表格筛选仅作用于当前加载的最近 N 条记录，不改变服务端日志。
  const accessPageSize = 50;

  const accessKeyword = ref("");

  const accessCategory = ref("all");

  const accessStatus = ref("all");

  const selectedAccess = ref<AccessEvent | null>(null);

  const accessDetailOpen = ref(false);

  const { copyState: accessCopyState, copyWithFeedback, resetCopyState } = useCopyFeedback();

  function openAccessDetail(event: AccessEvent): void {
    selectedAccess.value = event;
    resetCopyState();
    accessDetailOpen.value = true;
  }

  function closeAccessDetail(): void {
    accessDetailOpen.value = false;
  }

  function onAccessDetailOpenChange(open: boolean): void {
    accessDetailOpen.value = open;
    if (!open) {
      selectedAccess.value = null;
      resetCopyState();
    }
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
      `${t("monitor.k143")}：${event.host || t("monitor.k2")}`,
      `${t("monitor.k138")}：${event.user_agent || t("monitor.k2")}`,
      `${t("monitor.k144")}：${event.referer || t("monitor.k2")}`,
      `${t("monitor.k145")}：${event.accept || t("monitor.k2")}`,
      `${t("monitor.k146")}：${event.accept_language || t("monitor.k2")}`,
      `${t("monitor.k140")}：${event.content_type || t("monitor.k2")}`,
      "",
      t("monitor.k3"),
      formatAccessHeaders(event.request_headers),
    ];
    await copyWithFeedback(lines.join("\n"));
  }

  const filteredAccesses = computed(() => {
    const keyword = accessKeyword.value.trim().toLocaleLowerCase();
    return accesses.value.filter((event) => {
      if (accessCategory.value !== "all" && event.category !== accessCategory.value) return false;
      if (accessStatus.value === "success" && (event.status_code < 200 || event.status_code >= 300))
        return false;
      if (
        accessStatus.value === "redirect" &&
        (event.status_code < 300 || event.status_code >= 400)
      )
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
        accessHasMore.value = accesses.value.length < page.total;
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
      accessHasMore.value = accesses.value.length < page.total;
      accessTotal.value = page.total;
    } catch (caught) {
      accessLoadError.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      accessLoadingMore.value = false;
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

  async function initialise(): Promise<void> {
    try {
      // 复用路由守卫刚做过的会话探测（带短 TTL 缓存），避免首屏再串一次网络往返。
      const session: AdminSession = await fetchAdminSession();
      // 路由守卫只在导航时校验；会话在停留期间失效时这里必须自己回登录页，
      // 并带上当前地址，登录后才能回到这一页。
      if (!session.loggedIn) {
        await router.replace({
          name: "login",
          query: { redirect: router.currentRoute.value.fullPath },
        });
        return;
      }
      authChecking.value = false;
      await refreshDashboard();
      refreshTimer = setInterval(() => {
        // 标签页在后台时不轮询。
        if (document.hidden) return;
        void refreshDashboard(true);
      }, 10_000);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
      loading.value = false;
      authChecking.value = false;
    }
  }

  // 从后台切回前台时立刻补一次刷新。
  function onVisibilityChange() {
    if (!document.hidden) void refreshDashboard(true);
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    void initialise();
  });

  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return {
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
    accessDetailOpen,
    accessCopyState,
    openAccessDetail,
    closeAccessDetail,
    onAccessDetailOpenChange,
    formatAccessHeaders,
    copyAccessDetail,
    filteredAccesses,
    hasAccessFilters,
    resetAccessFilters,
    refreshDashboard,
    loadMoreAccesses,
    formatDate,
    formatDuration,
    formatBytes,
    categoryLabel,
    statusLabel,
    statusTone,
  };
}
