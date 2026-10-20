<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  api,
  type AdminSession,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
  type MonitorSummary,
  type PacStatus,
  type WorkflowRun,
} from "../api/client";

import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import ResponsiveTrendChart from "../components/ResponsiveTrendChart.vue";
import TextDetail from "../components/TextDetail.vue";


const { t } = useI18n();

const router = useRouter();
const loading = ref(true);
const refreshing = ref(false);
const generating = ref(false);
const error = ref("");
const notice = ref("");
const noticeOkay = ref(true);
const session = ref<AdminSession | null>(null);
const settings = ref<AppSettings | null>(null);
const status = ref<PacStatus | null>(null);
const logs = ref<GenerationLog[]>([]);
const monitor = ref<MonitorSummary | null>(null);
const engine = ref<GenpacProbe | null>(null);
const currentWorkflow = ref<WorkflowRun | null>(null);

const modeLabel = computed(() =>
  settings.value?.mode === "remote" ? t("dashboard.remoteRuleList") : t("dashboard.customRulesLabel")
);
const customRuleCount = computed(
  () => (settings.value?.directList.length ?? 0) + (settings.value?.blockList.length ?? 0)
);
const latestLog = computed(() => logs.value[0] ?? null);

function modeForLog(value: string): string {
  return value === "remote" ? t("dashboard.remoteRuleList") : value === "custom" ? t("dashboard.customRulesLabel") : value;
}

async function loadOverview(): Promise<void> {
  loading.value = !settings.value;
  refreshing.value = true;
  error.value = "";
  try {
    const nextSession: AdminSession = await api.session();
    session.value = nextSession;
    if (!nextSession.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (nextSession.mustChangePassword) {
      await router.replace("/admin/settings");
      return;
    }

    const [nextSettings, nextStatus, nextLogs, nextMonitor, nextEngine, nextWorkflows] =
      await Promise.all([
        api.settings(),
        api.status(),
        api.logsPage(6, 0),
        api.monitorSummary().catch(() => null),
        api.genpacStatus().catch(() => null),
        api.workflows(6).catch(() => null),
      ]);
    settings.value = nextSettings;
    status.value = nextStatus;
    logs.value = nextLogs.items;
    monitor.value = nextMonitor;
    engine.value = nextEngine;
    currentWorkflow.value = nextWorkflows?.current ?? null;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
async function generateNow(): Promise<void> {
  if (generating.value) return;
  generating.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await api.generate();
    noticeOkay.value = true;
    notice.value = t("dashboard.workflowStarted", { id: result.workflowId });
    await loadOverview();
  } catch (caught) {
    noticeOkay.value = false;
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    generating.value = false;
  }
}

onMounted(() => {
  void loadOverview();
});
</script>