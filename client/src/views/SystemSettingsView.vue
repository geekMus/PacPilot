<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type AppSettings, type StorageSummary } from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import ConfirmPopover from "../components/ConfirmPopover.vue";
import SelectField from "../components/SelectField.vue";
import { useToast } from "../composables/useToast";
import { useI18n } from "vue-i18n";
import { setAppLocale, resolveLocale, type AppLocale } from "../i18n";
const router = useRouter(),
  { notify } = useToast();
const { t } = useI18n();
const localeChoice = ref<AppLocale>("zh_CN");
const savingLocale = ref(false);
const loading = ref(true),
  savingRetention = ref(false),
  cleaning = ref(false),
  clearingLogs = ref(false),
  deletingPacFiles = ref(false),
  resetting = ref(false);
const settings = ref<AppSettings | null>(null),
  storage = ref<StorageSummary | null>(null),
  error = ref("");
const retention = ref(30);
const confirmationOpen = reactive({ clearLogs: false, deletePacFiles: false, factoryReset: false });
function setConfirmation(key: keyof typeof confirmationOpen, open: boolean) {
  for (const name of Object.keys(confirmationOpen) as Array<keyof typeof confirmationOpen>)
    confirmationOpen[name] = false;
  if (open) confirmationOpen[key] = true;
}
const maintenanceBusy = () =>
  cleaning.value || clearingLogs.value || deletingPacFiles.value || resetting.value;
const maintenanceDisabledReason = computed(() => {
  if (loading.value) return t("systemPage.k0");
  if (cleaning.value) return t("systemPage.k1");
  if (clearingLogs.value) return t("systemPage.k2");
  if (deletingPacFiles.value) return t("systemPage.k3");
  if (resetting.value) return t("systemPage.k4");
  return "";
});
const retentionDisabledReason = computed(() => {
  if (loading.value) return t("systemPage.k5");
  if (savingRetention.value) return t("systemPage.k6");
  if (!settings.value) return t("systemPage.k7");
  if (retention.value === settings.value.logRetentionDays) return t("systemPage.k8");
  return t("systemPage.k9");
});
const deletePacFilesDisabledReason = computed(() => {
  if (loading.value) return t("systemPage.k10");
  if (maintenanceBusy()) return maintenanceDisabledReason.value || t("systemPage.k11");
  if (!storage.value) return t("systemPage.k12");
  if (!storage.value.pacFiles.proxyPac.exists && !storage.value.pacFiles.proxySourcePac.exists)
    return t("systemPage.k13");
  return t("systemPage.k14");
});
function fileDateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"],
    i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return (bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const session = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (session.mustChangePassword) {
      await router.replace("/admin/settings");
      return;
    }
    const [s, st] = await Promise.all([api.settings(), api.storage()]);
    settings.value = s;
    retention.value = s.logRetentionDays;
    localeChoice.value = resolveLocale(s.locale);
    setAppLocale(localeChoice.value);
    storage.value = st;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    notify(error.value, "error");
  } finally {
    loading.value = false;
  }
}
async function saveLocale() {
  if (!settings.value || savingLocale.value) return;
  savingLocale.value = true;
  try {
    const saved = await api.saveSettings({ ...settings.value, locale: localeChoice.value });
    settings.value = saved;
    localeChoice.value = resolveLocale(saved.locale);
    setAppLocale(localeChoice.value);
    notify(t("system.localeSaved"), "success");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    savingLocale.value = false;
  }
}
async function saveRetention() {
  if (!settings.value || savingRetention.value) return;
  savingRetention.value = true;
  try {
    const saved = await api.saveSettings({ ...settings.value, logRetentionDays: retention.value });
    settings.value = saved;
    retention.value = saved.logRetentionDays;
    notify(t("systemPage.k15"), "success");
    await refreshStorage();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    savingRetention.value = false;
  }
}
async function refreshStorage() {
  try {
    storage.value = await api.storage();
  } catch (e) {
    notify(t("systemPage.k16") + (e instanceof Error ? e.message : String(e)), "error");
  }
}
async function cleanupLogs() {
  if (maintenanceBusy()) return;
  cleaning.value = true;
  try {
    const r = await api.cleanupLogs();
    notify(
      t("systemPage.cleanupDone", { g: r.deleted.generationLogs, a: r.deleted.accessEvents, p: r.deleted.proxyProbeRuns }),
      "success"
    );
    await refreshStorage();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    cleaning.value = false;
  }
}
async function clearAllLogs() {
  if (maintenanceBusy()) return;
  clearingLogs.value = true;
  try {
    const r = await api.clearLogs();
    setConfirmation("clearLogs", false);
    notify(
      t("systemPage.clearedLogsKeepWorkflow", { g: r.deleted.generationLogs, a: r.deleted.accessEvents, p: r.deleted.proxyProbeRuns }),
      "success"
    );
    await refreshStorage();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    clearingLogs.value = false;
  }
}
async function deletePacFiles() {
  if (maintenanceBusy() || !storage.value) return;
  deletingPacFiles.value = true;
  try {
    const r = await api.deletePacFiles();
    setConfirmation("deletePacFiles", false);
    if (r.deleted.length) notify(t("systemPage.k17") + r.deleted.join("、") + "。", "success");
    else notify(t("systemPage.k18"), "info");
    await refreshStorage();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    deletingPacFiles.value = false;
  }
}
async function factoryReset() {
  if (maintenanceBusy()) return;
  resetting.value = true;
  try {
    const r = await api.factoryReset();
    setConfirmation("factoryReset", false);
    notify(r.message, "success");
    await load();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    resetting.value = false;
  }
}
onMounted(() => void load());
</script>