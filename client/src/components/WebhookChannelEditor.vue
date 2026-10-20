<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import type { WebhookConfig, WebhookProvider } from "../api/client";
import AppIcon from "./AppIcon.vue";
import SelectField from "./SelectField.vue";
import WebhookBodyEditor from "./WebhookBodyEditor.vue";
import CodeMirrorField from "./CodeMirrorField.vue";
const { t } = useI18n();

type WebhookValidationErrors = Partial<
  Record<"url" | "headers" | "body" | "testBody" | "secret", string>
>;
const props = defineProps<{
  title: string;
  kind: "success" | "failure";
  modelValue: WebhookConfig;
  pending?: boolean;
  resultMessage?: string;
  resultOk?: boolean | null;
  validationErrors?: WebhookValidationErrors;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: WebhookConfig];
  test: [];
}>();

const config = computed(() => props.modelValue);
const providerId = useId();
const showDingTalkSecret = ref(false);
const providers: { value: WebhookProvider; label: string; description: string }[] = [
  { value: "custom", label: t("webhookChannel.k0"), description: t("webhookChannel.k1") },
  {
    value: "dingtalk",
    label: t("webhookChannel.k2"),
    description: t("webhookChannel.k3"),
  },
];

const bodySample = computed(() =>
  JSON.stringify(
    {
      event: "{{event}}",
      status: "{{status}}",
      ok: "{{ok}}",
      message: "{{message}}",
      timestamp: "{{timestamp}}",
    },
    null,
    2
  )
);
const testBodySample = JSON.stringify(
  {
    event: "{{event}}",
    status: "{{status}}",
    ok: "{{ok}}",
    message: "{{message}}",
    timestamp: "{{timestamp}}",
  },
  null,
  2
);
const testBodyEmptyHint = t("webhookChannel.k4");

function update<K extends keyof WebhookConfig>(key: K, value: WebhookConfig[K]) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}
const channelReady = computed(
  () =>
    Boolean(config.value.url.trim()) &&
    (config.value.provider !== "dingtalk" || Boolean(config.value.dingTalkSecret.trim()))
);
const channelStatusText = computed(() => {
  if (!config.value.url.trim()) return t("webhookChannel.k5");
  if (config.value.provider === "dingtalk" && !config.value.dingTalkSecret.trim())
    return t("webhookChannel.k6");
  return t("webhookChannel.k7");
});
</script>

<template>
  <section class="channel-card" :class="'channel-' + kind">
    <div class="channel-head">
      <div class="channel-heading">
        <span class="channel-mark" aria-hidden="true">
          <AppIcon
            :name="kind === 'success' ? 'circle-check' : 'alert-triangle'"
            :size="18"
            :stroke-width="1.8"
          />
        </span>
        <div>
          <h3>{{ title }}</h3>
          <p>{{ kind === "success" ? t("webhookChannel.k8") : t("webhookChannel.k9") }}</p>
        </div>
      </div>
      <button
        type="button"
        class="test-button"
        :class="{ 'is-loading': pending }"
        :disabled="pending"
        :title="
          pending ? t('webhookChannel.k10') : !channelReady ? channelStatusText : t('webhookChannel.k11')
        "
        @click="emit('test')"
      >
        <AppIcon
          :name="pending ? 'loader-circle' : 'activity'"
          :class="{ 'icon-spinning': pending }"
          :size="14"
        />
        {{ pending ? t("webhookChannel.k12") : t("webhookChannel.k13") }}
      </button>
    </div>

    <div class="provider-picker">
      <label :for="providerId">{{ t("webhookChannel.k27") }}</label>
      <SelectField block
        ><select
          :id="providerId"
          :value="config.provider"
          @change="update('provider', inputValue($event) as WebhookProvider)"
        >
          <option v-for="item in providers" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select></SelectField
      >
      <p class="field-hint">
        {{ providers.find((item) => item.value === config.provider)?.description }}
      </p>
    </div>

    <template v-if="config.provider === 'custom'">
      <div class="field" :data-validation-target="kind + '-url'">
        <label>Webhook URL</label>
        <CodeMirrorField
          :model-value="config.url"
          single-line
          :height="40"
          language="text"
          :invalid="Boolean(validationErrors?.url)"
          aria-label="Webhook URL"
          placeholder="https://example.com/hooks/pac"
          @update:model-value="update('url', $event)"
        />
        <p v-if="validationErrors?.url" class="field-error" role="alert">
          {{ validationErrors.url }}
        </p>
      </div>
      <div class="two-fields">
        <div class="field">
          <label>{{ t("webhookChannel.k28") }}</label>
          <SelectField block
            ><select
              :value="config.method"
              @change="update('method', inputValue($event) as WebhookConfig['method'])"
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </select></SelectField
          >
        </div>
        <div class="field">
          <label>{{ t("webhookChannel.k29") }}</label>
          <div class="field-static">application/json</div>
        </div>
      </div>
      <div class="field" :data-validation-target="kind + '-headers'">
        <label>{{ t("webhookChannel.k30") }} <span class="label-hint">{{ t("webhookChannel.k31") }}</span></label>
        <CodeMirrorField
          :model-value="config.headers"
          language="json"
          :height="126"
          :invalid="Boolean(validationErrors?.headers)"
          :aria-label='t("webhookChannel.k14")'
          placeholder='{"Authorization":"Bearer …"}'
          @update:model-value="update('headers', $event)"
        />
        <p v-if="validationErrors?.headers" class="field-error" role="alert">
          {{ validationErrors.headers }}
        </p>
        <p class="field-hint">
          {{ t("webhookChannel.k32") }}
        </p>
      </div>
      <div class="field" :data-validation-target="kind + '-body'">
        <label>{{ t("webhookChannel.k33") }} <span class="label-hint">{{ t("webhookChannel.k34") }}</span></label>
        <WebhookBodyEditor
          :model-value="config.body"
          :height="190"
          :sample="bodySample"
          :empty-hint='t("webhookChannel.k15")'
          :invalid="Boolean(validationErrors?.body)"
          :placeholder='t("webhookChannel.k16")'
          @update:model-value="update('body', $event)"
        />
        <p v-if="validationErrors?.body" class="field-error" role="alert">
          {{ validationErrors.body }}
        </p>
        <p class="field-hint">
          {{ t("webhookChannel.k35") }}<code v-pre>{{ event }}</code
          >、<code v-pre>{{ status }}</code
          >、<code v-pre>{{ message }}</code
          >、<code v-pre>{{ timestamp }}</code
          >、<code v-pre>{{ ok }}</code
          >{{ t("webhookChannel.k36") }}
        </p>
      </div>
      <div class="field" :data-validation-target="kind + '-test-body'">
        <label>{{ t("webhookChannel.k37") }} <span class="label-hint">{{ t("webhookChannel.k38") }}</span></label>
        <WebhookBodyEditor
          :model-value="config.testBody"
          :height="150"
          :sample="testBodySample"
          :empty-hint="testBodyEmptyHint"
          :invalid="Boolean(validationErrors?.testBody)"
          :placeholder='t("webhookChannel.k17")'
          @update:model-value="update('testBody', $event)"
        />
        <p v-if="validationErrors?.testBody" class="field-error" role="alert">
          {{ validationErrors.testBody }}
        </p>
        <p class="field-hint">
          {{ t("webhookChannel.k39") }}
        </p>
      </div>
    </template>

    <template v-else-if="config.provider === 'dingtalk'">
      <div class="field" :data-validation-target="kind + '-url'">
        <label>{{ t("webhookChannel.k40") }}</label>
        <CodeMirrorField
          :model-value="config.url"
          single-line
          :height="40"
          language="text"
          :invalid="Boolean(validationErrors?.url)"
          :aria-label='t("webhookChannel.k18")'
          placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
          @update:model-value="update('url', $event)"
        />
        <p v-if="validationErrors?.url" class="field-error" role="alert">
          {{ validationErrors.url }}
        </p>
        <p class="field-hint">
          {{ t("webhookChannel.k41") }}
        </p>
      </div>
      <div class="field" :data-validation-target="kind + '-secret'">
        <label>{{ t("webhookChannel.k42") }} <span class="label-hint">{{ t("webhookChannel.k43") }}</span></label>
        <div class="secret-field">
          <input
            :value="config.dingTalkSecret"
            :type="showDingTalkSecret ? 'text' : 'password'"
            :aria-invalid="Boolean(validationErrors?.secret)"
            autocomplete="new-password"
            :placeholder='t("webhookChannel.k19")'
            @input="update('dingTalkSecret', inputValue($event))"
          />
          <button
            type="button"
            class="reveal-button"
            :aria-label='t("webhookChannel.k20")'
            :aria-pressed="showDingTalkSecret"
            @click="showDingTalkSecret = !showDingTalkSecret"
          >
            <AppIcon :name="showDingTalkSecret ? 'eye-off' : 'eye'" :size="14" />
            {{ showDingTalkSecret ? t("webhookChannel.k21") : t("webhookChannel.k22") }}
          </button>
        </div>
        <p v-if="validationErrors?.secret" class="field-error" role="alert">
          {{ validationErrors.secret }}
        </p>
        <p class="field-hint">
          {{ t("webhookChannel.k44") }}<a
            href="https://open.dingtalk.com/document/robots/customize-robot-security-settings"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t("webhookChannel.k45") }}</a
          >
        </p>
      </div>
      <div class="field">
        <label>{{ t("webhookChannel.k46") }}</label>
        <div class="segmented">
          <button
            type="button"
            :class="{ active: config.dingTalkMessageType === 'text' }"
            @click="update('dingTalkMessageType', 'text')"
          >
            {{ t("webhookChannel.k47") }}
          </button>
          <button
            type="button"
            :class="{ active: config.dingTalkMessageType === 'markdown' }"
            @click="update('dingTalkMessageType', 'markdown')"
          >
            Markdown
          </button>
        </div>
      </div>
      <div class="field">
        <label>{{ t("webhookChannel.k48") }} <span class="label-hint">{{ t("webhookChannel.k49") }}</span></label>
        <CodeMirrorField
          :model-value="config.messageTemplate"
          language="text"
          :height="148"
          :aria-label='t("webhookChannel.k23")'
          :placeholder='t("webhookChannel.k24")'
          @update:model-value="update('messageTemplate', $event)"
        />
        <p class="field-hint">
          {{ t("webhookChannel.k50") }}<code v-pre>{{ event }}</code
          >、<code v-pre>{{ status }}</code
          >、<code v-pre>{{ message }}</code
          >、<code v-pre>{{ timestamp }}</code
          >、<code v-pre>{{ ok }}</code
          >{{ t("webhookChannel.k51") }}
        </p>
      </div>
      <div class="field">
        <label>{{ t("webhookChannel.k52") }} <span class="label-hint">{{ t("webhookChannel.k38") }}</span></label>
        <CodeMirrorField
          :model-value="config.testMessageTemplate"
          language="text"
          :height="112"
          :aria-label='t("webhookChannel.k25")'
          :placeholder='t("webhookChannel.k26")'
          @update:model-value="update('testMessageTemplate', $event)"
        />
        <p class="field-hint">{{ t("webhookChannel.k53") }}</p>
      </div>
    </template>

    <div class="channel-footer">
      <span class="configured-dot" :class="{ ready: channelReady }"></span>
      <span>{{ channelStatusText }}</span>
      <span class="footer-spacer"></span>
      <span class="timeout-note">{{ t("webhookChannel.k54") }}</span>
    </div>
    <p
      v-if="resultMessage"
      class="test-result"
      :class="resultOk ? 'success' : 'failure'"
      role="status"
      aria-live="polite"
    >
      <AppIcon :name="resultOk ? 'circle-check' : 'circle-alert'" :size="15" />{{ resultMessage }}
    </p>
  </section>
</template>

<style scoped>
.channel-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.channel-success {
  border-top: 2px solid color-mix(in srgb, var(--green) 65%, var(--line));
}
.channel-failure {
  border-top: 2px solid color-mix(in srgb, var(--red) 60%, var(--line));
}
.channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
}
.channel-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.channel-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
}
.channel-mark :deep(.app-icon) {
  width: 18px;
  height: 18px;
}
.channel-success .channel-mark {
  color: var(--green);
  background: var(--green-soft);
  border-color: color-mix(in srgb, var(--green) 22%, var(--line));
}
.channel-failure .channel-mark {
  color: var(--red);
  background: var(--red-soft);
  border-color: color-mix(in srgb, var(--red) 22%, var(--line));
}
.channel-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 750;
}
.channel-heading p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 11px;
}
.test-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  flex: 0 0 auto;
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 12px;
  min-height: 36px;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.test-button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface-2);
}
.test-button:active:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.test-button:disabled {
  opacity: 1;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
}
.test-button.is-loading:disabled {
  color: var(--text);
  -webkit-text-fill-color: var(--text);
  background: var(--surface);
  border-color: var(--line);
  cursor: progress;
}
.provider-picker {
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
}
.provider-picker label,
.field label {
  display: block;
  margin: 0 0 7px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}
.provider-picker select,
.field select,
.field-static {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 9px 10px;
  color: var(--text);
  background: var(--bg);
  font: inherit;
  font-size: 12px;
}
.provider-picker select,
.field select {
  cursor: pointer;
}
.provider-picker select:focus,
.field select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  min-width: 0;
}
.field-hint {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}
.field-error {
  margin: 6px 0 0;
  color: var(--red);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.field-hint a {
  display: inline-block;
  margin-top: 4px;
  color: var(--accent);
  font-weight: 650;
  text-decoration: none;
}
.field-hint a:hover {
  text-decoration: underline;
}
.label-hint {
  color: var(--muted);
  font-weight: 500;
}
.two-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 14px;
  min-width: 0;
}
.field-static {
  display: flex;
  align-items: center;
  overflow-wrap: anywhere;
  color: var(--muted);
  font: 11px var(--font-mono);
}
.secret-field {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}
.secret-field input {
  box-sizing: border-box;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 9px 10px;
  color: var(--text);
  background: var(--bg);
  font: inherit;
  font-size: 12px;
}
.secret-field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.secret-field input[aria-invalid="true"] {
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}
.reveal-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  flex: 0 0 auto;
  min-width: 66px;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.reveal-button:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-2);
  color: var(--accent);
}
.reveal-button:active:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.reveal-button:disabled {
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
}
.segmented {
  display: inline-flex;
  align-self: flex-start;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg);
}
.segmented button {
  min-height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  padding: 0 12px;
  font-size: 11px;
  cursor: pointer;
}
.segmented button:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-2);
}
.segmented button:active:not(:disabled) {
  color: var(--accent);
  background: var(--accent-soft);
}
.segmented button.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.segmented button:disabled {
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  cursor: not-allowed;
}
.icon-spinning {
  animation: webhook-icon-spin 0.9s linear infinite;
}
@keyframes webhook-icon-spin {
  to {
    transform: rotate(360deg);
  }
}
.channel-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 10px;
}
.configured-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.configured-dot.ready {
  background: var(--green);
}
.footer-spacer {
  flex: 1;
}
.timeout-note {
  white-space: nowrap;
}
.test-result {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 11px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.test-result.success {
  background: var(--green-soft);
  color: var(--green);
}
.test-result.failure {
  background: var(--red-soft);
  color: var(--red);
}
@media (max-width: 900px) {
  .two-fields {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
}
@media (max-width: 600px) {
  .channel-card {
    padding: 14px;
  }
  .channel-head {
    align-items: flex-start;
  }
}
</style>
