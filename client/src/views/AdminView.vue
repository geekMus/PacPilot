<script setup lang="ts">
import { defineAsyncComponent, ref } from "vue";
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppDialog from "../components/AppDialog.vue";
import AppFooter from "../components/AppFooter.vue";
import TextDetail from "../components/TextDetail.vue";
import VirtualTable from "../components/VirtualTable.vue";
import { useAdminSettings } from "../composables/useAdminSettings";
import { useViewportPanel } from "../composables/useViewportPanel";
import { PROJECT_LINKS } from "../../../shared/project-links";

const WebhookChannelEditor = defineAsyncComponent(
  () => import("../components/WebhookChannelEditor.vue")
);

const DomainListEditor = defineAsyncComponent(
  () => import("../components/DomainListEditor.vue")
);
const {
  t,
  loading,
  saving,
  flash,
  flashOk,
  error,
  logs,
  logHasMore,
  logLoadingMore,
  logLoadError,
  logTotal,
  loadMoreLogs,
  pacpilotProbe,
  timezoneMenuOpen,
  timezoneQuery,
  mobileTimezoneOpen,
  passwordSaving,
  passwordError,
  passwordForm,
  webhookTestState,
  form,
  generationLogText,
  generationLogDate,
  generationModeLabel,
  commonTimeZones,
  isValidTimeZone,
  filteredTimeZones,
  selectTimeZone,
  closeTimezoneMenu,
  openMobileTimezonePicker,
  modeHint,
  cronPresets,
  cronHint,
  applyCronPreset,
  pacProxyError,
  listUrlError,
  ruleAnalysis,
  directRuleDiagnostics,
  blockRuleDiagnostics,
  directListError,
  blockListError,
  timezoneError,
  cronError,
  webhookValidation,
  formErrors,
  handleFloatingSaveClick,
  canSubmit,
  hasUnsavedSettings,
  saveAndGenerate,
  testWebhook,
  changeAdminPassword,
} = useAdminSettings();

const timezoneAnchor = ref<HTMLElement | null>(null);
const timezonePanel = ref<HTMLElement | null>(null);
const { style: timezonePanelStyle } = useViewportPanel(
  timezoneAnchor,
  timezonePanel,
  timezoneMenuOpen,
  { matchAnchorWidth: true, maxHeight: 270, gap: 5 }
);
</script>

<template>
  <AdminLayout active="settings" :title="t('settings.title')" :subtitle="t('settings.subtitle')">
    <div class="admin-page">
      <section v-if="loading" class="state-card" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <strong>{{ t("settings.loading") }}</strong>
          <p>{{ t("settings.loadingDesc") }}</p>
        </div>
      </section>
      <div v-if="flash" class="banner" :class="flashOk ? 'ok' : 'bad'">
        <span class="banner-icon" aria-hidden="true"
          ><AppIcon :name="flashOk ? 'circle-check' : 'circle-alert'" :size="15"
        /></span>
        <pre class="banner-text">{{ flash }}</pre>
      </div>
      <div v-if="error" class="banner bad">
        <span class="banner-icon" aria-hidden="true"
          ><AppIcon name="circle-alert" :size="15"
        /></span>
        <pre class="banner-text">{{ error }}</pre>
      </div>

      <template v-if="!loading && !error">
        <section id="security" class="card security-card">
          <div class="card-head">
            <div>
              <h2>{{ t("settings.changePasswordTitle") }}</h2>
              <p class="card-sub">{{ t("settings.passwordStoredLocal") }}</p>
            </div>
          </div>
          <form class="password-change-form" @submit.prevent="changeAdminPassword">
            <div class="field">
              <label for="current-admin-password">{{ t("settings.currentPassword") }}</label>
              <input
                id="current-admin-password"
                v-model="passwordForm.currentPassword"
                type="password"
                autocomplete="current-password"
                required
                @input="passwordError = ''"
              />
            </div>
            <div class="field">
              <label for="new-admin-password">{{ t("settings.newPassword") }}</label>
              <input
                id="new-admin-password"
                v-model="passwordForm.newPassword"
                type="password"
                autocomplete="new-password"
                required
                :placeholder="t('settings.newPasswordPlaceholder')"
                @input="passwordError = ''"
              />
            </div>
            <div class="field">
              <label for="confirm-admin-password">{{ t("settings.confirmPassword") }}</label>
              <input
                id="confirm-admin-password"
                v-model="passwordForm.confirmPassword"
                type="password"
                autocomplete="new-password"
                required
                @input="passwordError = ''"
              />
            </div>
            <p v-if="passwordError" class="field-error" role="alert">{{ passwordError }}</p>
            <div class="actions">
              <button
                type="submit"
                class="btn primary"
                :class="{ 'is-loading': passwordSaving }"
                :disabled="passwordSaving"
                :title="
                  passwordSaving
                    ? t('settings.changingPasswordTitle')
                    : t('settings.changePasswordTitle')
                "
              >
                {{ passwordSaving ? t("settings.changingPassword") : t("settings.changePassword") }}
              </button>
            </div>
          </form>
          <p class="field-hint">
            {{ t("settings.resetHelpFull")
            }}<a
              :href="PROJECT_LINKS.adminPasswordReset"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t("settings.resetHelpLink") }}</a
            >
          </p>
        </section>

        <form
          id="settings-form"
          class="stack"
          :inert="saving"
          :aria-busy="saving"
          @submit.prevent="saveAndGenerate"
        >
          <!-- 常规设置 -->
          <section id="general" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true"
                  ><AppIcon name="calendar-clock" :size="18"
                /></span>
                <div>
                  <h2>{{ t("settings.general") }}</h2>
                  <p class="card-sub">{{ t("settings.generalDesc") }}</p>
                </div>
              </div>
            </div>
            <div class="field" data-validation-target="timezone">
              <label for="timezone">{{ t("settings.timezone") }}</label>
              <div ref="timezoneAnchor" class="timezone-picker desktop-timezone-picker">
                <input
                  id="timezone"
                  v-model="form.timezone"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="t('settings.timezoneSearch')"
                  :aria-invalid="Boolean(timezoneError)"
                  @focus="
                    timezoneMenuOpen = true;
                    timezoneQuery = '';
                  "
                  @input="timezoneQuery = form.timezone"
                  @blur="closeTimezoneMenu"
                  @keydown.esc="timezoneMenuOpen = false"
                />
                <Teleport to="body">
                  <div
                    v-if="timezoneMenuOpen"
                    ref="timezonePanel"
                    class="timezone-options-menu"
                    :style="timezonePanelStyle"
                    role="listbox"
                    :aria-label="t('settings.timezoneSuggest')"
                  >
                    <button
                      v-for="zone in filteredTimeZones"
                      :key="zone.value"
                      type="button"
                      role="option"
                      :aria-selected="form.timezone === zone.value"
                      class="timezone-option"
                      @pointerdown.prevent="selectTimeZone(zone.value)"
                    >
                      <span>{{ t(zone.labelKey) }}</span
                      ><code>{{ zone.value }}</code>
                    </button>
                    <p v-if="filteredTimeZones.length === 0" class="timezone-no-results">
                      {{ t("settings.timezoneNoMatch") }}
                    </p>
                  </div>
                </Teleport>
              </div>
              <button
                type="button"
                class="mobile-timezone-trigger"
                @click="openMobileTimezonePicker"
              >
                <span>{{ form.timezone || t("settings.selectTimezone") }}</span>
                <span class="mobile-timezone-trigger-icon" aria-hidden="true"
                  ><AppIcon name="chevron-down" :size="17"
                /></span>
              </button>
              <p class="field-hint">
                {{ t("settings.timezoneHintFull") }}
              </p>
              <p v-if="timezoneError" class="field-error" role="alert">{{ timezoneError }}</p>
            </div>

            <AppDialog
              :open="mobileTimezoneOpen"
              content-class="timezone-sheet"
              :label="t('settings.selectTimezone')"
              @update:open="mobileTimezoneOpen = $event"
            >
              <section class="timezone-sheet" aria-labelledby="mobile-timezone-title">
                <header class="timezone-sheet-head">
                  <h3 id="mobile-timezone-title">{{ t("settings.selectTimezone") }}</h3>
                  <button
                    type="button"
                    class="timezone-sheet-close"
                    :aria-label="t('settings.closeTimezone')"
                    @click="mobileTimezoneOpen = false"
                  >
                    <AppIcon name="x" :size="18" />
                  </button>
                </header>
                <input
                  v-model="timezoneQuery"
                  class="timezone-sheet-search"
                  type="search"
                  autocomplete="off"
                  :placeholder="t('settings.timezoneSearchShort')"
                  @keydown.enter.prevent
                />
                <div
                  class="timezone-sheet-options"
                  role="listbox"
                  :aria-label="t('settings.timezoneSuggest')"
                >
                  <button
                    v-for="zone in filteredTimeZones"
                    :key="zone.value"
                    type="button"
                    role="option"
                    :aria-selected="form.timezone === zone.value"
                    class="timezone-option"
                    @click="selectTimeZone(zone.value)"
                  >
                    <span>{{ t(zone.labelKey) }}</span
                    ><code>{{ zone.value }}</code>
                  </button>
                  <button
                    v-if="
                      timezoneQuery.trim() &&
                      isValidTimeZone(timezoneQuery) &&
                      !commonTimeZones.some(
                        (zone) => zone.value.toLowerCase() === timezoneQuery.trim().toLowerCase()
                      )
                    "
                    type="button"
                    role="option"
                    class="timezone-option timezone-custom-option"
                    @click="selectTimeZone(timezoneQuery.trim())"
                  >
                    <span>{{ t("settings.useCustomTimezone") }}</span
                    ><code>{{ timezoneQuery.trim() }}</code>
                  </button>
                  <p
                    v-if="filteredTimeZones.length === 0 && !isValidTimeZone(timezoneQuery)"
                    class="timezone-no-results"
                  >
                    {{ t("settings.timezoneNoMatchStrict") }}
                  </p>
                </div>
                <p class="timezone-sheet-hint">
                  {{ t("settings.timezoneSelectHint") }}
                </p>
              </section>
            </AppDialog>
            <div class="chip-row timezone-presets">
              <button
                v-for="zone in commonTimeZones.slice(0, 6)"
                :key="zone.value"
                type="button"
                class="chip"
                :class="{ active: form.timezone === zone.value }"
                @click="form.timezone = zone.value"
              >
                {{ t(zone.labelKey) }}
              </button>
            </div>
          </section>

          <!-- 模式 -->
          <section id="mode" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="workflow" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.startMode") }}</h2>
                  <p class="card-sub">{{ t("settings.startModeDesc") }}</p>
                </div>
              </div>
            </div>

            <div class="mode-grid">
              <label class="mode-card" :class="{ active: form.mode === 'custom' }">
                <input v-model="form.mode" type="radio" value="custom" />
                <div class="mode-card-body">
                  <div class="mode-top">
                    <span class="mode-name">{{ t("settings.customRules") }}</span>
                    <span class="tag">{{ t("settings.recommended") }}</span>
                  </div>
                  <p class="mode-desc">{{ t("settings.customModeDesc") }}</p>
                </div>
              </label>
              <label class="mode-card" :class="{ active: form.mode === 'remote' }">
                <input v-model="form.mode" type="radio" value="remote" />
                <div class="mode-card-body">
                  <div class="mode-top">
                    <span class="mode-name">{{ t("settings.remoteRules") }}</span>
                    <span class="tag">{{ t("settings.bunBuiltin") }}</span>
                  </div>
                  <p class="mode-desc">
                    {{ t("settings.remoteModeDesc") }}
                  </p>
                </div>
              </label>
            </div>

            <p class="hint-line">{{ modeHint }}</p>

            <div
              v-if="form.mode === 'remote' && pacpilotProbe"
              class="probe"
              :class="pacpilotProbe.available ? 'ok' : 'warn'"
            >
              <strong>{{
                pacpilotProbe.available ? t("settings.engineReady") : t("settings.engineAbnormal")
              }}</strong>
              <span>{{ pacpilotProbe.detail }}</span>
              <span v-if="!pacpilotProbe.available" class="probe-help">
                {{ t("settings.engineHint") }}
              </span>
            </div>
          </section>

          <!-- 代理 -->
          <section id="proxy" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="globe" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.proxyAndRemote") }}</h2>
                  <p class="card-sub">{{ t("settings.proxyAndRemoteDesc") }}</p>
                </div>
              </div>
            </div>

            <div class="field" data-validation-target="pac-proxy">
              <label for="pacProxy">{{ t("settings.pacProxy") }}</label>
              <input
                id="pacProxy"
                v-model="form.pacProxy"
                :aria-invalid="Boolean(pacProxyError)"
                placeholder="SOCKS5 127.0.0.1:1080; DIRECT"
              />
              <p class="field-hint">
                {{ t("settings.pacProxyHintFull") }}
              </p>
              <p v-if="pacProxyError" class="field-error" role="alert">{{ pacProxyError }}</p>
            </div>
            <div
              class="field"
              :class="{ 'is-disabled': form.mode !== 'remote' }"
              data-validation-target="list-url"
            >
              <label for="listUrl"
                >{{ t("settings.listUrlLabel") }}
                <span class="lab-hint">{{ t("settings.listUrlLabHint") }}</span></label
              >
              <input
                id="listUrl"
                v-model="form.listUrl"
                :disabled="form.mode !== 'remote'"
                :aria-disabled="form.mode !== 'remote'"
                :aria-invalid="Boolean(listUrlError)"
                placeholder="https://example.com/list.txt"
              />
              <p class="field-hint">
                {{ t("settings.listUrlDescFull")
                }}<span v-if="form.mode !== 'remote'" class="disabled-hint">{{
                  t("settings.listUrlEditWhenRemote")
                }}</span>
              </p>
              <p v-if="listUrlError" class="field-error" role="alert">{{ listUrlError }}</p>
            </div>
            <div class="checks">
              <label class="check">
                <input v-model="form.pacCompress" type="checkbox" />
                <span>{{ t("settings.compressPac") }}</span>
              </label>
            </div>
            <p class="field-hint">
              {{ t("settings.compressPacHintFull") }}
            </p>
          </section>

          <!-- 规则列表 -->
          <section id="rules" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="list-checks" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.customRulesTitle") }}</h2>
                  <p class="card-sub">{{ t("settings.customRulesDesc") }}</p>
                </div>
              </div>
            </div>

            <details class="help">
              <summary>{{ t("settings.howToConfig") }}</summary>
              <div class="help-body">
                <p>{{ t("settings.writing") }} {{ t("settings.writingFull") }}</p>
                <p>
                  <strong>{{ t("settings.directListLabel") }}</strong
                  >{{ t("settings.directHit") }}
                </p>
                <p>
                  <strong>{{ t("settings.blockListLabel") }}</strong
                  >{{ t("settings.blockHit") }}
                </p>
                <p>
                  <strong>{{ t("settings.matchOrder") }}</strong>
                </p>
                <ol>
                  <li>{{ t("settings.matchLocal") }}</li>
                  <li>{{ t("settings.matchBlock") }}</li>
                  <li>{{ t("settings.matchDirect") }}</li>
                  <li>{{ t("settings.matchRemote") }}</li>
                  <li>{{ t("settings.matchCustomRest") }}</li>
                </ol>
              </div>
            </details>

            <div class="split editors">
              <div class="field" data-validation-target="direct-list">
                <label>{{ t("settings.directList") }}</label>
                <DomainListEditor
                  v-model="form.directListText"
                  :height="320"
                  :invalid="Boolean(directListError)"
                  :diagnostics="directRuleDiagnostics"
                  placeholder="example.com&#10;*.example.org&#10;**.example.net"
                />
                <p v-if="directListError" class="field-error" role="alert">{{ directListError }}</p>
              </div>
              <div class="field" data-validation-target="block-list">
                <label>{{ t("settings.blockList") }}</label>
                <DomainListEditor
                  v-model="form.blockListText"
                  :height="320"
                  :invalid="Boolean(blockListError)"
                  :diagnostics="blockRuleDiagnostics"
                  placeholder="ads.example.com"
                />
                <p v-if="blockListError" class="field-error" role="alert">{{ blockListError }}</p>
              </div>
            </div>
            <div
              v-if="ruleAnalysis.totalErrors || ruleAnalysis.totalWarnings"
              class="rule-analysis-summary"
              aria-live="polite"
            >
              <div class="rule-analysis-title">
                {{
                  t("settings.ruleCheckSummary", {
                    errors: ruleAnalysis.totalErrors,
                    warnings: ruleAnalysis.totalWarnings,
                  })
                }}
              </div>
              <p v-if="ruleAnalysis.totalErrors" class="field-error">
                {{ t("settings.ruleCheckFixErrors") }}
              </p>
              <p v-if="ruleAnalysis.totalWarnings" class="field-hint">
                {{ t("settings.ruleCheckHints") }}
              </p>
            </div>
          </section>

          <!-- 定时与 webhook -->
          <section id="schedule" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="calendar-clock" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.scheduleWebhook") }}</h2>
                  <p class="card-sub">
                    {{ t("settings.scheduleWebhookDesc") }}
                  </p>
                </div>
              </div>
            </div>

            <div class="sub-block">
              <div class="sub-title">{{ t("dashboard.scheduledGen") }}</div>
              <div class="chip-row" role="group" :aria-label="t('settings.cronPreset')">
                <button
                  v-for="p in cronPresets"
                  :key="p.value || p.labelKey"
                  type="button"
                  class="chip"
                  :class="{ active: form.cronSchedule.trim() === p.value }"
                  @click="applyCronPreset(p.value)"
                >
                  {{ t(p.labelKey) }}
                </button>
              </div>
              <div class="field" data-validation-target="cron">
                <label for="cron"
                  >{{ t("settings.cronExpr") }}
                  <span class="lab-hint">{{ t("settings.cronFields") }}</span></label
                >
                <input
                  id="cron"
                  v-model="form.cronSchedule"
                  class="mono"
                  :aria-invalid="Boolean(cronError)"
                  spellcheck="false"
                  autocomplete="off"
                  :placeholder="t('settings.cronExample')"
                />
                <p
                  class="field-hint"
                  :class="{ 'field-error': Boolean(cronError) }"
                  :aria-live="cronError ? 'polite' : undefined"
                >
                  {{ cronHint }}
                </p>
              </div>
            </div>

            <div class="webhook-grid">
              <WebhookChannelEditor
                :title="t('settings.successNotify')"
                kind="success"
                :model-value="form.webhookSuccessConfig"
                :pending="webhookTestState.success.pending"
                :result-message="webhookTestState.success.message"
                :result-ok="webhookTestState.success.ok"
                :validation-errors="webhookValidation.success"
                @update:model-value="form.webhookSuccessConfig = $event"
                @test="testWebhook('success')"
              />
              <WebhookChannelEditor
                :title="t('settings.failureNotify')"
                kind="failure"
                :model-value="form.webhookFailureConfig"
                :pending="webhookTestState.failure.pending"
                :result-message="webhookTestState.failure.message"
                :result-ok="webhookTestState.failure.ok"
                :validation-errors="webhookValidation.failure"
                @update:model-value="form.webhookFailureConfig = $event"
                @test="testWebhook('failure')"
              />
            </div>
          </section>

          <div class="actions-block">
            <div v-if="formErrors.length" class="validation-box">
              <div class="validation-title">{{ t("settings.fixBeforeSave") }}</div>
              <ul>
                <li v-for="(e, i) in formErrors" :key="i">{{ e }}</li>
              </ul>
            </div>
            <p class="actions-hint">
              {{ t("settings.floatingSaveHint") }}
            </p>
          </div>
        </form>

        <section id="logs" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <AppIcon name="chart" :size="18" />
              </span>
              <div>
                <h2>{{ t("settings.recentLogs") }}</h2>
                <p class="card-sub">
                  {{ t("settings.loadedLogs", { loaded: logs.length, total: logTotal }) }}
                </p>
              </div>
            </div>
          </div>
          <VirtualTable
            :items="logs"
            item-key="id"
            :col-span="4"
            :row-height="58"
            height="420px"
            min-width="700px"
            :has-more="logHasMore"
            :loading="logLoadingMore"
            :error="logLoadError"
            :empty-text="t('settings.noLogs')"
            :load-more="loadMoreLogs"
          >
            <template #columns
              ><col style="width: 145px" />
              <col style="width: 78px" />
              <col style="width: 120px" />
              <col style="width: 357px"
            /></template>
            <template #header
              ><tr>
                <th>{{ t("settings.colTime") }}</th>
                <th>{{ t("settings.colResult") }}</th>
                <th>{{ t("settings.colMode") }}</th>
                <th>{{ t("settings.colMessage") }}</th>
              </tr></template
            >
            <template #row="{ item: l }">
              <tr>
                <td class="nowrap">{{ generationLogDate(l.created_at) }}</td>
                <td>
                  <span class="pill" :class="l.success ? 'ok' : 'bad'">{{
                    l.success ? t("common.success") : t("common.failed")
                  }}</span>
                </td>
                <td>{{ generationModeLabel(l.mode) }}</td>
                <td class="msg">
                  <TextDetail :text="generationLogText(l)" :label="t('settings.genLogInfo')" />
                </td>
              </tr>
            </template>
          </VirtualTable>
        </section>

        <button
          v-if="hasUnsavedSettings"
          form="settings-form"
          :type="canSubmit ? 'submit' : 'button'"
          class="floating-save-button"
          :class="{ 'is-loading': saving, 'has-errors': formErrors.length > 0 && !saving }"
          :disabled="saving"
          :aria-busy="saving"
          :aria-invalid="formErrors.length > 0 ? 'true' : undefined"
          :aria-label="
            saving
              ? t('settings.savingAndGenerating')
              : formErrors.length
                ? t('settings.validationIssues')
                : t('settings.saveAndGenerate')
          "
          :title="
            saving
              ? t('settings.savingAndGenerating')
              : formErrors.length
                ? t('settings.validationIssues')
                : t('settings.saveAndGenerate')
          "
          @click="handleFloatingSaveClick"
        >
          <AppIcon
            :name="saving ? 'loader-circle' : formErrors.length ? 'circle-alert' : 'save'"
            :size="21"
            :class="{ 'save-spinner': saving }"
          />
        </button>
      </template>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped src="./AdminView.css"></style>
