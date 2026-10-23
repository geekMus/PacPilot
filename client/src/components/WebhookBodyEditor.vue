<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import MonacoEditorField from "@/components/MonacoEditorField.vue";
const { t } = useI18n();
const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string; sample?: string; height?: number; emptyHint?: string; invalid?: boolean; }>(),
  { placeholder: "", sample: "", height: 220, invalid: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const editorModel = computed({ get: () => props.modelValue, set: (value: string) => emit("update:modelValue", value) });
const jsonStatus = computed(() => {
  const raw = props.modelValue.trim();
  if (!raw) return { kind: "empty", text: props.emptyHint ?? t("webhookBody.k0") };
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object") return { kind: "invalid", text: t("webhookBody.k1") };
    return { kind: "valid", text: t("webhookBody.k2") };
  } catch { return { kind: "invalid", text: t("webhookBody.k3") }; }
});
const canFormat = computed(() => jsonStatus.value.kind === "valid");
function replaceDocument(value: string) { emit("update:modelValue", value); }
function formatJson() {
  if (!canFormat.value) return;
  try { replaceDocument(JSON.stringify(JSON.parse(props.modelValue), null, 2)); }
  catch { /* Preserve the source if formatting fails. */ }
}
function insertSample() { if (props.sample) replaceDocument(props.sample); }
</script>
<template>
  <div class="json-editor" :class="{ invalid: invalid || jsonStatus.kind === 'invalid' }">
    <div class="json-editor-toolbar">
      <div class="json-editor-language">
        <span class="language-dot" aria-hidden="true"></span><span>JSON</span>
      </div>
      <div class="json-editor-actions">
        <button
          type="button"
          class="editor-action"
          :disabled="!canFormat"
          :title="canFormat ? t('webhookBody.k4') : jsonStatus.text"
          @click="formatJson"
        >
          {{ t("webhookBody.k5") }}
        </button>
        <button v-if="sample" type="button" class="editor-action" @click="insertSample">
          {{ t("webhookBody.k6") }}
        </button>
      </div>
    </div>
    <div class="json-editor-frame" :style="{ height: height + 'px' }">
      <MonacoEditorField v-model="editorModel" class="webhook-monaco-editor" :height="height" language="json" :line-numbers="true" aria-label="Webhook JSON body" />
      <div v-if="!modelValue && placeholder" class="json-placeholder">{{ placeholder }}</div>
    </div>
    <div class="json-editor-status" :class="jsonStatus.kind" role="status" aria-live="polite">
      <span class="status-indicator" aria-hidden="true"></span>{{ jsonStatus.text }}
    </div>
  </div>
</template>

<style scoped>
.json-editor {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.json-editor.invalid {
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}
.json-editor-toolbar {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}
.json-editor-language,
.json-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.json-editor-language {
  color: var(--muted);
  font: 600 11px var(--font-mono);
  letter-spacing: 0.06em;
}
.language-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.editor-action {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  min-height: 28px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.editor-action:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface-2);
}
.editor-action:active:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.editor-action:disabled {
  opacity: 1;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
}
.json-editor-frame {
  position: relative;
  overflow: hidden;
}
.webhook-monaco-editor { width: 100%; height: 100%; }
.webhook-monaco-editor :deep(.monaco-field-frame) { height: 100%; border: 0; border-radius: 0; }
.webhook-monaco-editor :deep(.monaco-field-host) { height: 100% !important; }
.webhook-monaco-editor :deep(.monaco-editor), .webhook-monaco-editor :deep(.monaco-editor .overflow-guard) { height: 100% !important; }
.json-placeholder {
  position: absolute;
  top: 10px;
  left: 48px;
  right: 12px;
  color: var(--muted);
  opacity: 0.72;
  pointer-events: none;
  font: 13px/1.55 var(--font-mono);
}
.json-editor-status {
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.status-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--muted);
}
.json-editor-status.valid .status-indicator {
  background: var(--green);
}
.json-editor-status.invalid {
  color: var(--red);
}
.json-editor-status.invalid .status-indicator {
  background: var(--red);
}
@media (max-width: 720px) {
  .json-editor-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .json-editor-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
