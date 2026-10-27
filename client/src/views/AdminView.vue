<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { CheckboxIndicator, CheckboxRoot, RadioGroupItem, RadioGroupRoot } from "reka-ui";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppInput from "@/components/AppInput.vue";
import AppFooter from "@/components/AppFooter.vue";
import { useAdminSettings } from "@/composables/useAdminSettings";
import LazyMount from "@/components/LazyMount.vue";
import { DEFAULT_LIST_URL } from "@shared/contracts";

const DomainListEditor = defineAsyncComponent(
  () => import("@/features/domain-rules/components/DomainListEditor.vue")
);
const {
  t,
  loading,
  saving,
  error,
  pacpilotProbe,
  form,
  modeHint,
  cronPresets,
  cronHint,
  onCronCommit,
  applyCronPreset,
  onModeChange,
  saveMode,
  onPacProxyCommit,
  onListUrlCommit,
  onPacCompressToggle,
  onPacObfuscateToggle,
  pacProxyError,
  listUrlError,
  ruleAnalysis,
  directRuleDiagnostics,
  blockRuleDiagnostics,
  directListError,
  blockListError,
  ruleErrors,
  hasUnsavedRules,
  hasUnsavedMode,
  saveRules,
  cronError,
} = useAdminSettings();
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
      <div v-if="error" class="banner bad">
        <span class="banner-icon" aria-hidden="true"
          ><AppIcon name="circle-alert" :size="15"
        /></span>
        <pre class="banner-text">{{ error }}</pre>
      </div>

      <template v-if="!loading && !error">
        <!--
          不要在这里加 :inert="saving"：输入框失焦保存会在 mousedown 之后、
          click 之前把表单置为 inert，导致用户紧接着点击的保存按钮收不到 click。
          串行保存队列已保证同一时间只有一个请求在途，无需冻结表单。
        -->
        <form id="settings-form" class="stack" :aria-busy="saving" @submit.prevent>
          <!-- 模式 -->
          <section id="mode" class="card">
            <div class="card-head card-head-with-action">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="workflow" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.startMode") }}</h2>
                  <p class="card-sub">{{ t("settings.startModeDesc") }}</p>
                </div>
              </div>
              <button
                type="button"
                class="app-button app-button--primary rules-save-button"
                :class="{ 'is-loading': saving }"
                :disabled="!hasUnsavedMode"
                :aria-busy="saving"
                :title="t('settings.saveModeHint')"
                @click="saveMode"
              >
                <AppIcon
                  :name="saving ? 'loader-circle' : 'save'"
                  :size="15"
                  :class="{ 'save-spinner': saving }"
                />
                {{ t("settings.saveModeBtn") }}
              </button>
            </div>

            <RadioGroupRoot
              :model-value="form.mode"
              class="mode-grid"
              :aria-label="t('settings.title')"
              @update:model-value="onModeChange(String($event))"
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
              <span>{{ t("settings.engineDetail") }}</span>
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

            <div class="field">
              <label for="pacProxy">{{ t("settings.pacProxy") }}</label>
              <AppInput
                id="pacProxy"
                v-model="form.pacProxy"
                :invalid="Boolean(pacProxyError)"
                placeholder="SOCKS5 127.0.0.1:1080; DIRECT"
                @change="onPacProxyCommit"
              />
              <p class="field-hint">
                {{ t("settings.pacProxyHintFull") }}
              </p>
              <p v-if="pacProxyError" class="field-error" role="alert">{{ pacProxyError }}</p>
            </div>
            <div class="field" :class="{ 'is-disabled': form.mode !== 'remote' }">
              <label for="listUrl"
                >{{ t("settings.listUrlLabel") }}
                <span class="lab-hint">{{ t("settings.listUrlLabHint") }}</span></label
              >
              <AppInput
                id="listUrl"
                v-model="form.listUrl"
                :disabled="form.mode !== 'remote'"
                :aria-disabled="form.mode !== 'remote'"
                :invalid="Boolean(listUrlError)"
                :placeholder="DEFAULT_LIST_URL"
                @change="onListUrlCommit"
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
                  :model-value="form.pacCompress"
                  class="admin-checkbox"
                  @update:model-value="onPacCompressToggle($event === true)"
                >
                  <CheckboxIndicator>
                    <AppIcon name="check" :size="14" aria-hidden="true" />
                  </CheckboxIndicator>
                </CheckboxRoot>
                <span>{{ t("settings.compressPac") }}</span>
              </label>
              <label class="check">
                <CheckboxRoot
                  :model-value="form.pacObfuscate"
                  class="admin-checkbox"
                  @update:model-value="onPacObfuscateToggle($event === true)"
                >
                  <CheckboxIndicator>
                    <AppIcon name="check" :size="14" aria-hidden="true" />
                  </CheckboxIndicator>
                </CheckboxRoot>
                <span>{{ t("settings.obfuscatePac") }}</span>
              </label>
            </div>
            <p class="field-hint">
              {{ t("settings.compressPacHintFull") }}
            </p>
            <p class="field-hint">
              {{ t("settings.obfuscatePacHintFull") }}
            </p>
          </section>

          <!-- 规则列表 -->
          <section id="rules" class="card">
            <div class="card-head card-head-with-action">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="list-checks" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.customRulesTitle") }}</h2>
                  <p class="card-sub">{{ t("settings.customRulesDesc") }}</p>
                </div>
              </div>
              <button
                type="button"
                class="app-button app-button--primary rules-save-button"
                :class="{ 'is-loading': saving }"
                :disabled="!hasUnsavedRules || Boolean(ruleErrors)"
                :aria-busy="saving"
                :title="t('settings.saveRulesHint')"
                @click="saveRules"
              >
                <AppIcon
                  :name="saving ? 'loader-circle' : 'save'"
                  :size="15"
                  :class="{ 'save-spinner': saving }"
                />
                {{ t("settings.saveRulesBtn") }}
              </button>
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
              <div class="field">
                <label>{{ t("settings.directList") }}</label>
                <LazyMount :min-height="320">
                  <DomainListEditor
                    v-model="form.directListText"
                    :height="320"
                    :invalid="Boolean(directListError)"
                    :diagnostics="directRuleDiagnostics"
                    placeholder="example.com&#10;*.example.org&#10;**.example.net"
                  />
                </LazyMount>
                <p v-if="directListError" class="field-error" role="alert">{{ directListError }}</p>
              </div>
              <div class="field">
                <label>{{ t("settings.blockList") }}</label>
                <LazyMount :min-height="320">
                  <DomainListEditor
                    v-model="form.blockListText"
                    :height="320"
                    :invalid="Boolean(blockListError)"
                    :diagnostics="blockRuleDiagnostics"
                    placeholder="ads.example.com"
                  />
                </LazyMount>
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
              <div class="field">
                <label for="cron"
                  >{{ t("settings.cronExpr") }}
                  <span class="lab-hint">{{ t("settings.cronFields") }}</span></label
                >
                <AppInput
                  id="cron"
                  v-model="form.cronSchedule"
                  class="mono"
                  :invalid="Boolean(cronError)"
                  spellcheck="false"
                  autocomplete="off"
                  :placeholder="t('settings.cronExample')"
                  @change="onCronCommit"
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
        </form>
      </template>
      <!-- 加载完成前不渲染页脚，避免它先从首屏内被推到折叠线以下而计入 CLS。 -->
      <AppFooter v-if="!loading && !error" />
    </div>
  </AdminLayout>
</template>

<style scoped src="@/views/AdminView.css"></style>
