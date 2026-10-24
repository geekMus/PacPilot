<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type AppSettings, type StorageSummary } from "@/api/client";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppInput from "@/components/AppInput.vue";
import AppFooter from "@/components/AppFooter.vue";
import ConfirmPopover from "@/components/ConfirmPopover.vue";
import AppSelect from "@/components/AppSelect.vue";
import { useToast } from "@/composables/useToast";
import { useI18n } from "vue-i18n";
import { useAdminPassword } from "@/composables/useAdminPassword";
import { PROJECT_LINKS } from "@shared/project-links";
const router = useRouter(),
  { notify } = useToast();
const { t, locale } = useI18n();
const { passwordSaving, passwordError, passwordForm, changeAdminPassword } = useAdminPassword();
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
  return t("systemPage.clearPacCacheAction");
});
function fileDateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN") : "—";
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
    const [s, st] = await Promise.all([api.settings(), api.storage()]);
    settings.value = s;
    retention.value = s.logRetentionDays;
    storage.value = st;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    notify(error.value, "error");
  } finally {
    loading.value = false;
  }
}
async function saveRetention() {
  if (!settings.value || savingRetention.value) return;
  savingRetention.value = true;
  try {
    const latest = await api.settings();
    const saved = await api.saveSettings({ ...latest, logRetentionDays: retention.value });
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
      t("systemPage.cleanupDone", {
        g: r.deleted.generationLogs,
        a: r.deleted.accessEvents,
      }),
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
      t("systemPage.clearedLogsKeepWorkflow", {
        g: r.deleted.generationLogs,
        a: r.deleted.accessEvents,
      }),
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
      <section class="settings-panel password-settings-panel">
        <div class="heading">
          <span class="icon-badge"><AppIcon name="shield-check" :size="19" /></span>
          <div><h2>{{ t("settings.changePasswordTitle") }}</h2><p>{{ t("settings.passwordStoredLocal") }}</p></div>
        </div>
        <form class="system-password-form" @submit.prevent="changeAdminPassword">
          <label><span>{{ t("settings.currentPassword") }}</span><AppInput v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required :placeholder="t('settings.currentPassword')" @input="passwordError = ''" /></label>
          <label><span>{{ t("settings.newPassword") }}</span><AppInput v-model="passwordForm.newPassword" type="password" autocomplete="new-password" required :placeholder="t('settings.newPasswordPlaceholder')" @input="passwordError = ''" /></label>
          <label><span>{{ t("settings.confirmPassword") }}</span><AppInput v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" required :placeholder="t('settings.confirmPassword')" @input="passwordError = ''" /></label>
          <p v-if="passwordError" class="system-password-error" role="alert">{{ passwordError }}</p>
          <p class="system-password-help">{{ t("settings.resetHelpFull") }} <a :href="PROJECT_LINKS.adminPasswordReset" target="_blank" rel="noopener noreferrer">{{ t("settings.resetHelpLink") }}</a></p>
          <div class="password-settings-actions"><AppButton variant="primary" type="submit" :disabled="passwordSaving"><AppIcon :name="passwordSaving ? 'loader-circle' : 'key-round'" :size="15" />{{ passwordSaving ? t("settings.changingPassword") : t("settings.changePassword") }}</AppButton></div>
        </form>
      </section>
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
            class="app-button app-button--secondary"
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
          {{ error }} <AppButton variant="secondary" @click="load">{{ t("common.retry") }}</AppButton>
        </div>
        <div v-else-if="storage" class="metrics">
          <div class="metric">
            <span>{{ t("system.dataDir") }}</span
            ><strong>{{ formatBytes(storage.dataBytes) }}</strong
            ><small>{{ t("system.dataDirHint") }}</small>
          </div>
          <div class="metric">
            <span>{{ t("system.dbFile") }}</span
            ><strong>{{ formatBytes(storage.dbBytes) }}</strong
            ><small>{{ t("system.dbFileHint") }}</small>
          </div>
          <div class="metric">
            <span>{{ t("system.logEstimate") }}</span
            ><strong>{{ formatBytes(storage.logBytes) }}</strong
            ><small>{{ t("system.logEstimateHint") }}</small>
          </div>
        </div>
        <div v-if="storage" class="counts">
          <span>{{ t("systemPage.countGen", { n: storage.counts.generationLogs }) }}</span
          ><span>{{ t("systemPage.countAccess", { n: storage.counts.accessEvents }) }}</span
          ><span>{{ t("systemPage.countWorkflow", { n: storage.counts.workflows }) }}</span>
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
          ><AppSelect
            id="retention"
            v-model="retention"
            :disabled="loading || savingRetention"
            :options="[
              { value: 0, label: t('systemPage.k46') },
              { value: 7, label: t('systemPage.k47') },
              { value: 30, label: t('systemPage.k48') },
              { value: 90, label: t('systemPage.k49') },
              { value: 180, label: t('systemPage.k50') },
              { value: 365, label: t('systemPage.k51') },
            ]"
          /><button
            class="app-button app-button--primary"
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
            class="app-button app-button--secondary"
            type="button"
            :disabled="loading"
            :title="loading ? t('system.readingStorage') : t('system.refreshStorage')"
            @click="refreshStorage"
          >
            <AppIcon name="refresh-cw" :size="14" /> {{ t("systemPage.refreshStatus") }}
          </button>
        </div>
        <div v-if="storage?.pac" class="pac-files">
            <div class="pac-file">
              <div class="pac-file-head">
                <strong>/pac</strong
                ><span
                  class="file-state"
                  :class="storage.pac.rendered.exists ? 'file-exists' : 'file-missing'"
                  >{{
                    storage.pac.rendered.exists ? t("systemPage.k21") : t("systemPage.k22")
                  }}</span
                >
              </div>
              <p>{{ t("systemPage.pacRenderedDesc") }}</p>
              <div class="pac-file-meta">
                <span>{{
                  t("systemPage.pacBytes", { size: formatBytes(storage.pac.rendered.sizeBytes) })
                }}</span
                ><span>{{
                  storage.pac.rendered.builtAt
                    ? t("systemPage.fileMtime", {
                        time: fileDateLabel(storage.pac.rendered.builtAt),
                      })
                    : "—"
                }}</span
                >
              </div>
              <div class="pac-file-meta">
                <span>{{
                  storage.pac.rendered.compressed
                    ? t("systemPage.pacCompressed")
                    : t("systemPage.pacPlain")
                }}</span
                ><span class="pac-etag">{{ storage.pac.rendered.etag || "—" }}</span>
              </div>
            </div>
            <div class="pac-file">
              <div class="pac-file-head">
                <strong>{{ t("systemPage.ruleSnapshot") }}</strong
                ><span
                  class="file-state"
                  :class="storage.pac.ruleSource.exists ? 'file-exists' : 'file-missing'"
                  >{{
                    storage.pac.ruleSource.exists ? t("systemPage.k21") : t("systemPage.k22")
                  }}</span
                >
              </div>
              <p>{{ t("systemPage.ruleSnapshotDesc") }}</p>
              <div class="pac-file-meta">
                <span>{{
                  storage.pac.ruleSource.exists
                    ? t("systemPage.fileMtime", {
                        time: fileDateLabel(storage.pac.ruleSource.fetchedAt),
                      })
                    : t("systemPage.ruleSnapshotNone")
                }}</span
                ><span v-if="storage.pac.ruleSource.exists">{{
                  t("systemPage.ruleCounts", {
                    proxy: storage.pac.ruleSource.proxyHosts,
                    direct: storage.pac.ruleSource.directHosts,
                  })
                }}</span>
              </div>
              <div v-if="storage.pac.ruleSource.exists" class="pac-file-meta">
                <span class="pac-etag">{{ storage.pac.ruleSource.url }}</span>
              </div>
            </div>
          </div>
          <p v-if="storage?.pac && !storage.pac.rendered.exists" class="empty-note">
            {{ t("systemPage.pacNotRendered") }}
          </p>
          <ConfirmPopover
            :open="confirmationOpen.deletePacFiles"
            :title="t('systemPage.clearPacCache')"
            :description="t('systemPage.clearPacCacheDesc')"
            :confirm-text="t('systemPage.k27')"
            :busy-text="t('systemPage.k28')"
            align="start"
            :disabled="loading || maintenanceBusy() || !storage"
            :disabled-reason="deletePacFilesDisabledReason"
            :busy="deletingPacFiles"
            @update:open="setConfirmation('deletePacFiles', $event)"
            @confirm="deletePacFiles"
            ><template #trigger="{ toggle, open }"
              ><button
                class="app-button app-button--danger"
                type="button"
                :aria-expanded="open"
                :disabled="loading || maintenanceBusy() || !storage"
                :title="deletePacFilesDisabledReason"
                @click="toggle"
              >
                <AppIcon :name="deletingPacFiles ? 'loader-circle' : 'trash-2'" :size="15" />
                {{ deletingPacFiles ? t("systemPage.k28") : t("systemPage.clearPacCache") }}
              </button></template
            ></ConfirmPopover
          >
          <p class="hint">{{ t("systemPage.clearPacCacheHint") }}</p>
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
            class="app-button app-button--secondary"
            :disabled="loading || maintenanceBusy()"
            :title="
              loading
                ? t('systemPage.k0')
                : maintenanceBusy()
                  ? maintenanceDisabledReason
                  : t('systemPage.k29')
            "
            @click="cleanupLogs"
          >
            <AppIcon :name="cleaning ? 'loader-circle' : 'trash-2'" :size="15" />
            {{ cleaning ? t("systemPage.k30") : t("systemPage.k31") }}</button
          ><ConfirmPopover
            :open="confirmationOpen.clearLogs"
            :title="t('systemPage.k32')"
            :description="t('systemPage.k33')"
            :confirm-text="t('systemPage.k34')"
            :busy-text="t('systemPage.k35')"
            :disabled="loading || maintenanceBusy()"
            :disabled-reason="maintenanceDisabledReason"
            :busy="clearingLogs"
            @update:open="setConfirmation('clearLogs', $event)"
            @confirm="clearAllLogs"
            ><template #trigger="{ toggle, open }"
              ><button
                class="app-button app-button--danger"
                type="button"
                :aria-expanded="open"
                :disabled="loading || maintenanceBusy()"
                :title="
                  loading
                    ? t('systemPage.k0')
                    : maintenanceBusy()
                      ? maintenanceDisabledReason
                      : t('systemPage.k36')
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
          :title="t('systemPage.k38')"
          :description="t('systemPage.k39')"
          :confirm-text="t('systemPage.k40')"
          :busy-text="t('systemPage.k41')"
          align="start"
          :disabled="loading || maintenanceBusy()"
          :disabled-reason="maintenanceDisabledReason"
          :busy="resetting"
          @update:open="setConfirmation('factoryReset', $event)"
          @confirm="factoryReset"
          ><template #trigger="{ toggle, open }"
            ><button
              class="app-button app-button--danger"
              type="button"
              :aria-expanded="open"
              :disabled="loading || maintenanceBusy()"
              :title="
                loading
                  ? t('systemPage.k0')
                  : maintenanceBusy()
                    ? maintenanceDisabledReason
                    : t('systemPage.k42')
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
@reference "@/styles/tailwind.css";

.maintenance-status {
  @apply mb-3 mt-0 rounded-lg border px-[11px] py-[9px] text-[11px] leading-snug;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
  overflow-wrap: anywhere;
}
.system-password-form {
  @apply grid grid-cols-3 gap-3.5;
}
.system-password-form label {
  @apply grid gap-[7px] text-xs font-semibold;
  color: var(--muted);
}
.system-password-error {
  @apply col-span-full m-0 text-xs;
  color: var(--red);
}
.system-password-help {
  @apply col-span-full m-0 text-[11px] leading-normal;
  color: var(--muted);
}
.system-password-help a {
  color: var(--accent);
}
.password-settings-actions {
  @apply col-span-full flex justify-end;
}
.password-settings-actions button {
  @apply inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3.5;
  border-color: var(--accent);
  color: var(--accent-contrast);
  background: var(--accent);
}
.password-settings-actions button:disabled {
  @apply cursor-progress opacity-65;
}
@media (max-width: 800px) {
  .system-password-form {
    @apply grid-cols-1;
  }
}
.system-settings {
  @apply grid gap-[18px];
}
.settings-panel {
  @apply min-w-0 rounded-[13px] border p-[22px];
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm, 0 4px 18px #00000008);
}
.heading {
  @apply mb-[18px] flex items-center gap-3;
}
.heading > div {
  @apply min-w-0 flex-1;
}
.heading h2 {
  @apply m-0 text-base;
  color: var(--text);
}
.heading p {
  @apply mb-0 mt-[5px] text-xs leading-normal;
  color: var(--muted);
}
.icon-badge {
  @apply grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border;
  border-color: var(--line);
  color: var(--accent);
  background: var(--surface-2);
}
.metrics {
  @apply grid grid-cols-3 gap-3;
}
.metric {
  @apply grid min-w-0 gap-[7px] rounded-[10px] border p-[15px];
  border-color: var(--line);
  background: var(--surface-2);
}
.metric span,
.metric small {
  @apply text-[11px];
  color: var(--muted);
}
.metric strong {
  @apply text-[22px];
  color: var(--text);
  overflow-wrap: anywhere;
}
.counts {
  @apply mt-3.5 flex flex-wrap gap-x-[18px] gap-y-2 text-[11px];
  color: var(--muted);
}
.pac-files {
  @apply mb-3.5 grid grid-cols-2 gap-3;
}
.pac-file {
  @apply grid min-w-0 gap-2 rounded-[10px] border p-3.5;
  border-color: var(--line);
  background: var(--surface-2);
}
.pac-file-head {
  @apply flex items-center justify-between gap-2.5;
}
.pac-file-head strong {
  @apply text-[13px];
  overflow-wrap: anywhere;
}
.pac-file p {
  @apply m-0 text-[11px] leading-normal;
  color: var(--muted);
}
.pac-file-meta {
  @apply grid gap-[5px] text-[11px];
  color: var(--muted);
  overflow-wrap: anywhere;
}
.file-state {
  @apply whitespace-nowrap rounded-full border px-[7px] py-[3px] text-[10px] font-bold;
  border-color: var(--line);
}
.file-exists {
  color: var(--green);
  border-color: color-mix(in srgb, var(--green) 35%, var(--line));
}
.file-missing {
  color: var(--muted);
}
.empty-note {
  @apply mb-3.5 mt-0 rounded-[9px] border border-dashed p-3 text-xs leading-normal;
  border-color: var(--line);
  color: var(--muted);
}
.history-count {
  @apply shrink-0 rounded-full border px-[9px] py-1 text-[11px];
  border-color: var(--line);
  color: var(--muted);
}
.maintenance-actions {
  @apply flex flex-wrap gap-2.5;
}
.retention {
  @apply flex flex-wrap items-center gap-3;
}
.retention label {
  @apply text-xs font-bold;
  color: var(--text);
}
.retention .app-select {
  @apply w-[145px] min-w-[145px];
  flex: 0 0 145px;
}
.retention-status {
  @apply mb-0 mt-3 rounded-lg border px-2.5 py-2 text-[11px] leading-normal;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
}
.hint {
  @apply mb-0 mt-2 text-[11px] leading-normal;
  color: var(--muted);
}
.danger-panel {
  border-color: color-mix(in srgb, var(--red) 24%, var(--line));
}
.danger-icon {
  color: var(--red);
}
.state {
  @apply px-0 py-3.5 text-[13px];
  color: var(--muted);
}
.state.error {
  color: var(--red);
}
.state-loading {
  @apply flex items-start gap-3 rounded-[10px] border p-4;
  border-color: var(--line);
  background: var(--surface-2);
}
.state-loading strong {
  @apply block text-[13px];
  color: var(--text);
}
.state-loading p {
  @apply mb-0 mt-1 text-xs leading-normal;
}
.spinner {
  @apply h-[18px] w-[18px] shrink-0 animate-[sys-spin_0.8s_linear_infinite] rounded-full border-2;
  border-color: var(--line);
  border-top-color: var(--accent);
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
    @apply p-[15px];
  }
  .metrics {
    @apply grid-cols-1;
  }
  .pac-files {
    @apply grid-cols-1;
  }
  .metric strong {
    @apply text-xl;
  }
  .heading {
    @apply items-start;
  }
  .retention {
    @apply flex-col items-stretch;
  }
  .retention > * {
    @apply w-full;
  }
  .retention .app-select {
    @apply flex w-full min-w-0;
    flex: 1 1 auto;
  }
}
</style>
