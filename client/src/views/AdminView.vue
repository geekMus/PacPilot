<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import {
  CheckboxIndicator,
  CheckboxRoot,
  RadioGroupItem,
  RadioGroupRoot,
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from "reka-ui";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppInput from "@/components/AppInput.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
import AppDialog from "@/components/AppDialog.vue";
import { DialogDescription, DialogTitle } from "reka-ui";
import AppFooter from "@/components/AppFooter.vue";
import { useAdminSettings } from "@/composables/useAdminSettings";

const DomainListEditor = defineAsyncComponent(
  () => import("@/features/domain-rules/components/DomainListEditor.vue")
);
const {
  t,
  loading,
  saving,
  flash,
  flashOk,
  error,
  pacpilotProbe,
  timezoneMenuOpen,
  timezoneQuery,
  form,
  commonTimeZones,
  filteredTimeZones,
  selectTimeZone,
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
  formErrors,
  handleFloatingSaveClick,
  canSubmit,
  hasUnsavedSettings,
  saveAndGenerate,
} = useAdminSettings();

</script>

<template>
  <AdminLayout active="settings" :title="t('settings.title')" :subtitle="t('settings.subtitle')">
    <div class="admin-page" :class="{ 'has-floating-save': hasUnsavedSettings }">
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
              <ComboboxRoot
                :model-value="form.timezone"
                :open="timezoneMenuOpen"
                :search-term="timezoneQuery"
                class="timezone-combobox desktop-timezone-picker"
                @update:open="timezoneMenuOpen = $event"
                @update:model-value="selectTimeZone($event)"
                @update:search-term="timezoneQuery = $event"
              >
                <ComboboxAnchor as-child>
                  <div class="timezone-picker">
                    <ComboboxInput
                      id="timezone"
                      class="timezone-combobox-input"
                      autocomplete="off"
                      spellcheck="false"
                      :display-value="(value) => String(value ?? '')"
                      :placeholder="t('settings.timezoneSearch')"
                      :aria-invalid="Boolean(timezoneError)"
                      @focus="timezoneMenuOpen = true; timezoneQuery = ''"
                    />
                    <AppIcon class="timezone-picker-icon" name="chevron-down" :size="15" aria-hidden="true" />
                  </div>
                </ComboboxAnchor>
                <ComboboxPortal>
                  <ComboboxContent
                    class="timezone-options-menu"
                    position="popper"
                    align="start"
                    :side-offset="5"
                    :collision-padding="10"
                  >
                    <AppScrollArea
                      root-class="timezone-options-scroll-area"
                      viewport-class="timezone-options-viewport"
                      orientation="vertical"
                      type="hover"
                    >
                      <template #viewport="{ viewportComponent, viewportClass, onScroll }">
                        <ComboboxViewport as-child>
                          <component
                            :is="viewportComponent"
                            :class="viewportClass"
                            @scroll.passive="onScroll"
                          >
                            <ComboboxItem
                              v-for="zone in filteredTimeZones"
                              :key="zone.value"
                              :value="zone.value"
                              class="timezone-option"
                            >
                              <span>{{ t(zone.labelKey) }}</span>
                              <code>{{ zone.value }}</code>
                            </ComboboxItem>
                            <ComboboxEmpty class="timezone-no-results">
                              {{ t("settings.timezoneNoMatch") }}
                            </ComboboxEmpty>
                          </component>
                        </ComboboxViewport>
                      </template>
                    </AppScrollArea>
                  </ComboboxContent>
                </ComboboxPortal>
              </ComboboxRoot>
              <p class="field-hint">
                {{ t("settings.timezoneHintFull") }}
              </p>
              <p v-if="timezoneError" class="field-error" role="alert">{{ timezoneError }}</p>
            </div>

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

            <RadioGroupRoot
              :model-value="form.mode"
              class="mode-grid"
              :aria-label="t('settings.title')"
              @update:model-value="form.mode = $event as 'custom' | 'remote'"
            >
              <RadioGroupItem as-child value="custom" :aria-label="t('settings.customRules')">
                <label class="mode-card" :class="{ active: form.mode === 'custom' }">
                  <div class="mode-card-body">
                    <div class="mode-top">
                      <span class="mode-name">{{ t("settings.customRules") }}</span>
                      <span class="tag">{{ t("settings.recommended") }}</span>
                    </div>
                    <p class="mode-desc">{{ t("settings.customModeDesc") }}</p>
                  </div>
                </label>
              </RadioGroupItem>
              <RadioGroupItem as-child value="remote" :aria-label="t('settings.remoteRules')">
                <label class="mode-card" :class="{ active: form.mode === 'remote' }">
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
              </RadioGroupItem>
            </RadioGroupRoot>

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
              <AppInput
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
              <AppInput
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
                <CheckboxRoot
                  :checked="form.pacCompress"
                  class="admin-checkbox"
                  @update:checked="form.pacCompress = $event === true"
                >
                  <CheckboxIndicator>
                    <AppIcon name="check" :size="14" aria-hidden="true" />
                  </CheckboxIndicator>
                </CheckboxRoot>
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
                  <h2>{{ t("settings.scheduleOnly") }}</h2>
                  <p class="card-sub">
                    {{ t("settings.scheduleOnlyDesc") }}
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
                <AppInput
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

<style scoped src="@/views/AdminView.css"></style>
