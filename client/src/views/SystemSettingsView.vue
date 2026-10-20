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
<template>
  <AdminLayout
    active="system-settings"
    :title="t('system.title')"
    :subtitle="t('system.subtitleFull')"
  >
    <div class="system-settings">
      <p v-if="maintenanceBusy()" class="maintenance-status" role="status" aria-live="polite">
        {{ maintenanceDisabledReason }}
      </p>
      <section class="settings-panel">
        <div class="heading">
          <span class="icon-badge"><AppIcon name="database" :size="19" /></span>
          <div>
            <h2>{{ t("system.storage") }}</h2>
            <p>{{ t("system.storageDesc") }}</p>
          </div>
          <button
            class="secondary"
            type="button"
            :disabled="loading"
            :title="loading ? t('system.readingStorage') : t('system.refreshStorage')"
            @click="refreshStorage"
          >
            <AppIcon name="refresh-cw" :size="14" /> {{ t("common.refresh") }}
          </button>
        </div>
        <div v-if="loading" class="state state-loading" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <div>
            <strong>{{ t("system.readingSystem") }}</strong>
            <p>{{ t("system.checkingStorage") }}</p>
          </div>
        </div>
        <div v-else-if="error" class="state error" role="alert">
          {{ error }} <button class="secondary" @click="load">{{ t("common.retry") }}</button>
        </div>
        <div v-else-if="storage" class="metrics">
          <div class="metric">
            <span>{{ t("system.dataDir") }}</span><strong>{{ formatBytes(storage.dataBytes) }}</strong
            ><small>{{ t("system.dataDirHint") }}</small>
          </div>
          <div class="metric">
            <span>{{ t("system.dbFile") }}</span><strong>{{ formatBytes(storage.dbBytes) }}</strong
            ><small>{{ t("system.dbFileHint") }}</small>
          </div>
          <div class="metric">
            <span>{{ t("system.logEstimate") }}</span><strong>{{ formatBytes(storage.logBytes) }}</strong
            ><small>{{ t("system.logEstimateHint") }}</small>
          </div>
        </div>
        <div v-if="storage" class="counts">
          <span>{{ t("systemPage.countGen", { n: storage.counts.generationLogs }) }}</span
          ><span>{{ t("systemPage.countAccess", { n: storage.counts.accessEvents }) }}</span
          ><span>{{ t("systemPage.countProbe", { n: storage.counts.proxyProbeRuns }) }}</span
          ><span>{{ t("systemPage.countWorkflow", { n: storage.counts.workflows }) }}</span>
        </div>
      </section>
      <section class="settings-panel">
        <div class="heading">
          <span class="icon-badge"><AppIcon name="globe" :size="19" /></span>
          <div>
            <h2>{{ t("app.language") }}</h2>
            <p>{{ t("app.languageHint") }}</p>
          </div>
        </div>
        <div class="retention">
          <label for="locale">{{ t("system.locale") }}</label
          ><SelectField
            ><select id="locale" v-model="localeChoice" :disabled="loading || savingLocale">
              <option value="zh_CN">{{ t("app.zh") }}</option>
              <option value="en_US">{{ t("app.en") }}</option>
            </select></SelectField
          ><button
            class="primary"
            :disabled="loading || savingLocale || !settings || localeChoice === settings.locale"
            @click="saveLocale"
          >
            <AppIcon :name="savingLocale ? 'loader-circle' : 'save'" :size="15" />
            {{ savingLocale ? t("common.loading") : t("common.save") }}
          </button>
        </div>
      </section>
      <section class="settings-panel">
        <div class="heading">
          <span class="icon-badge"><AppIcon name="calendar-clock" :size="19" /></span>
          <div>
            <h2>{{ t("systemPage.k43") }}</h2>
            <p>{{ t("systemPage.k44") }}</p>
          </div>
        </div>
        <div class="retention">
          <label for="retention">{{ t("systemPage.k45") }}</label
          ><SelectField
            ><select
              id="retention"
              v-model.number="retention"
              :disabled="loading || savingRetention"
            >
              <option :value="0">{{ t("systemPage.k46") }}</option>
              <option :value="7">{{ t("systemPage.k47") }}</option>
              <option :value="30">{{ t("systemPage.k48") }}</option>
              <option :value="90">{{ t("systemPage.k49") }}</option>
              <option :value="180">{{ t("systemPage.k50") }}</option>
              <option :value="365">{{ t("systemPage.k51") }}</option>
            </select></SelectField
          ><button
            class="primary"
            :disabled="
              loading || savingRetention || !settings || retention === settings.logRetentionDays
            "
            :title="retentionDisabledReason"
            @click="saveRetention"
          >
            <AppIcon :name="savingRetention ? 'loader-circle' : 'save'" :size="15" />
            {{ savingRetention ? t("systemPage.k19") : t("systemPage.k20") }}
          </button>
        </div>
        <p
          v-if="!loading && !savingRetention && settings && retention === settings.logRetentionDays"
          class="retention-status"
          role="status"
        >
          {{ t("systemPage.k52") }}
        </p>
        <p class="hint">{{ t("systemPage.k53") }}</p>
      </section>
      <section class="settings-panel">
        <div class="heading">
          <span class="icon-badge"><AppIcon name="file-text" :size="19" /></span>
          <div>
            <h2>{{ t("systemPage.k54") }}</h2>
            <p>
              {{ t("systemPage.k55") }}
            </p>
          </div>
          <button
            class="secondary"
            type="button"
            :disabled="loading"
            :title="loading ? t('system.readingStorage') : t('system.refreshStorage')"
            @click="refreshStorage"
          >
            <AppIcon name="refresh-cw" :size="14" /> {{ t("systemPage.refreshStatus") }}
          </button>
        </div>
        <div v-if="storage" class="pac-files">
          <div class="pac-file">
            <div class="pac-file-head">
              <strong>proxy.pac</strong
              ><span
                class="file-state"
                :class="storage.pacFiles.proxyPac.exists ? 'file-exists' : 'file-missing'"
                >{{ storage.pacFiles.proxyPac.exists ? t("systemPage.k21") : t("systemPage.k22") }}</span
              >
            </div>
            <p>{{ t("systemPage.k56") }}</p>
            <div class="pac-file-meta">
              <span>{{ t("systemPage.fileSize", { size: formatBytes(storage.pacFiles.proxyPac.sizeBytes) }) }}</span
              ><span>{{ t("systemPage.fileMtime", { time: fileDateLabel(storage.pacFiles.proxyPac.modifiedAt) }) }}</span>
            </div>
          </div>
          <div class="pac-file">
            <div class="pac-file-head">
              <strong>proxy.source.pac</strong
              ><span
                class="file-state"
                :class="storage.pacFiles.proxySourcePac.exists ? 'file-exists' : 'file-missing'"
                >{{ storage.pacFiles.proxySourcePac.exists ? t("systemPage.k21") : t("systemPage.k22") }}</span
              >
            </div>
            <p>{{ t("systemPage.k57") }}</p>
            <div class="pac-file-meta">
              <span>{{ t("systemPage.fileSize", { size: formatBytes(storage.pacFiles.proxySourcePac.sizeBytes) }) }}</span
              ><span
                >{{ t("systemPage.fileMtime", { time: fileDateLabel(storage.pacFiles.proxySourcePac.modifiedAt) }) }}</span
              >
            </div>
          </div>
        </div>
        <p v-if="storage && !storage.pacFiles.proxyPac.exists" class="empty-note">
          {{
            storage.pacFiles.proxySourcePac.exists
              ? t("systemPage.k23")
              : t("systemPage.k24")
          }}
        </p>
        <ConfirmPopover
          :open="confirmationOpen.deletePacFiles"
          title=t("systemPage.k25")
          description=t("systemPage.k26")
          confirm-text=t("systemPage.k27")
          busy-text=t("systemPage.k28")
          align="start"
          :disabled="
            loading ||
            maintenanceBusy() ||
            !storage ||
            (!storage.pacFiles.proxyPac.exists && !storage.pacFiles.proxySourcePac.exists)
          "
          :disabled-reason="deletePacFilesDisabledReason"
          :busy="deletingPacFiles"
          @update:open="setConfirmation('deletePacFiles', $event)"
          @confirm="deletePacFiles"
          ><template #trigger="{ toggle, open }"
            ><button
              class="danger"
              type="button"
              :aria-expanded="open"
              :disabled="
                loading ||
                maintenanceBusy() ||
                !storage ||
                (!storage.pacFiles.proxyPac.exists && !storage.pacFiles.proxySourcePac.exists)
              "
              :title="deletePacFilesDisabledReason"
              @click="toggle"
            >
              <AppIcon :name="deletingPacFiles ? 'loader-circle' : 'trash-2'" :size="15" />
              {{ deletingPacFiles ? t("systemPage.k28") : t("systemPage.k14") }}
            </button></template
          ></ConfirmPopover
        >
        <p class="hint">{{ t("systemPage.k58") }}</p>
      </section>
      <section class="settings-panel">
        <div class="heading">
          <span class="icon-badge"><AppIcon name="trash-2" :size="19" /></span>
          <div>
            <h2>{{ t("systemPage.k59") }}</h2>
            <p>
              {{ t("systemPage.k60") }}
            </p>
          </div>
        </div>
        <div class="maintenance-actions">
          <button
            class="secondary"
            :disabled="loading || maintenanceBusy()"
            :title="
              loading
                ? t("systemPage.k0")
                : maintenanceBusy()
                  ? maintenanceDisabledReason
                  : t("systemPage.k29")
            "
            @click="cleanupLogs"
          >
            <AppIcon :name="cleaning ? 'loader-circle' : 'trash-2'" :size="15" />
            {{ cleaning ? t("systemPage.k30") : t("systemPage.k31") }}</button
          ><ConfirmPopover
            :open="confirmationOpen.clearLogs"
            title=t("systemPage.k32")
            description=t("systemPage.k33")
            confirm-text=t("systemPage.k34")
            busy-text=t("systemPage.k35")
            :disabled="loading || maintenanceBusy()"
            :disabled-reason="maintenanceDisabledReason"
            :busy="clearingLogs"
            @update:open="setConfirmation('clearLogs', $event)"
            @confirm="clearAllLogs"
            ><template #trigger="{ toggle, open }"
              ><button
                class="danger"
                type="button"
                :aria-expanded="open"
                :disabled="loading || maintenanceBusy()"
                :title="
                  loading
                    ? t("systemPage.k0")
                    : maintenanceBusy()
                      ? maintenanceDisabledReason
                      : t("systemPage.k36")
                "
                @click="toggle"
              >
                <AppIcon :name="clearingLogs ? 'loader-circle' : 'trash-2'" :size="15" />
                {{ clearingLogs ? t("systemPage.k35") : t("systemPage.k37") }}
              </button></template
            ></ConfirmPopover
          >
        </div>
        <p class="hint">
          {{ t("systemPage.k61") }}
        </p>
      </section>
      <section class="settings-panel danger-panel">
        <div class="heading">
          <span class="icon-badge danger-icon"><AppIcon name="alert-triangle" :size="19" /></span>
          <div>
            <h2>{{ t("systemPage.k40") }}</h2>
            <p>{{ t("systemPage.k62") }}</p>
          </div>
        </div>
        <ConfirmPopover
          :open="confirmationOpen.factoryReset"
          title=t("systemPage.k38")
          description=t("systemPage.k39")
          confirm-text=t("systemPage.k40")
          busy-text=t("systemPage.k41")
          align="start"
          :disabled="loading || maintenanceBusy()"
          :disabled-reason="maintenanceDisabledReason"
          :busy="resetting"
          @update:open="setConfirmation('factoryReset', $event)"
          @confirm="factoryReset"
          ><template #trigger="{ toggle, open }"
            ><button
              class="danger"
              type="button"
              :aria-expanded="open"
              :disabled="loading || maintenanceBusy()"
              :title="
                loading
                  ? t("systemPage.k0")
                  : maintenanceBusy()
                    ? maintenanceDisabledReason
                    : t("systemPage.k42")
              "
              @click="toggle"
            >
              <AppIcon :name="resetting ? 'loader-circle' : 'rotate-ccw'" :size="15" />
              {{ resetting ? t("systemPage.k41") : t("systemPage.k40") }}
            </button></template
          ></ConfirmPopover
        >
        <p class="hint">{{ t("systemPage.k63") }}</p>
      </section>
      <AppFooter />
    </div>
  </AdminLayout>
</template>
<style scoped>
.maintenance-status {
  margin: 0 0 12px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.system-settings {
  display: grid;
  gap: 18px;
}
.settings-panel {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--surface);
  box-shadow: var(--shadow-sm, 0 4px 18px #00000008);
}
.heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.heading > div {
  flex: 1;
  min-width: 0;
}
.heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
}
.heading p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
.icon-badge {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 11px;
  color: var(--accent);
  background: var(--surface-2);
}
.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.metric {
  display: grid;
  gap: 7px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  min-width: 0;
}
.metric span,
.metric small {
  color: var(--muted);
  font-size: 11px;
}
.metric strong {
  font-size: 22px;
  color: var(--text);
  overflow-wrap: anywhere;
}
.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 11px;
}
.pac-files {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.pac-file {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}
.pac-file-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.pac-file-head strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.pac-file p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.pac-file-meta {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.file-state {
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.file-exists {
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 35%, var(--line));
}
.file-missing {
  color: var(--muted);
}
.empty-note {
  margin: 0 0 14px;
  padding: 12px;
  border: 1px dashed var(--line);
  border-radius: 9px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.history-count {
  flex: 0 0 auto;
  padding: 4px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
}
.maintenance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.retention {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.retention label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}
.retention .select-field {
  width: 145px;
  min-width: 145px;
  flex: 0 0 145px;
}
.retention .select-field :deep(select) {
  min-height: 38px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}
.primary,
.secondary,
.danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}
.secondary {
  background: var(--surface);
  color: var(--text);
}
.danger {
  background: var(--red-soft);
  border-color: color-mix(in srgb, var(--red) 35%, var(--line));
  color: var(--red);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.retention-status {
  margin: 12px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.hint {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}
.danger-panel {
  border-color: color-mix(in srgb, var(--red) 24%, var(--line));
}
.danger-icon {
  color: var(--red);
}
.state {
  padding: 14px 0;
  color: var(--muted);
  font-size: 13px;
}
.state.error {
  color: var(--red);
}
.state-loading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}
.state-loading strong {
  display: block;
  color: var(--text);
  font-size: 13px;
}
.state-loading p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: sys-spin 0.8s linear infinite;
  flex: 0 0 auto;
}
@keyframes sys-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
@media (max-width: 650px) {
  .settings-panel {
    padding: 15px;
  }
  .metrics {
    grid-template-columns: 1fr;
  }
  .pac-files {
    grid-template-columns: 1fr;
  }
  .metric strong {
    font-size: 20px;
  }
  .heading {
    align-items: flex-start;
  }
  .retention {
    align-items: stretch;
    flex-direction: column;
  }
  .retention > * {
    width: 100%;
  }
  .retention .select-field {
    display: flex;
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
  }
}
</style>
