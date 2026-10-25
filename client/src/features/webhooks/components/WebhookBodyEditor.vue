<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { EditorView, highlightActiveLine } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import CodeMirrorField from "@/components/CodeMirrorField.vue";

const { t } = useI18n();
const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** 默认内容：既是 placeholder 展示文案，也是「填入默认值」按钮写入的内容。 */
    sample?: string;
    /** 覆盖 placeholder 展示；不传时直接展示 sample。 */
    placeholder?: string;
    height?: number;
    invalid?: boolean;
    language?: "json" | "text";
    lineNumbers?: boolean;
    ariaLabel?: string;
  }>(),
  {
    placeholder: "",
    sample: "",
    height: 220,
    invalid: false,
    language: "json",
    lineNumbers: true,
    ariaLabel: "",
  }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const shownPlaceholder = computed(() => props.placeholder || props.sample);
const isJson = computed(() => props.language === "json");
const jsonStatus = computed(() => {
  const raw = props.modelValue.trim();
  if (!raw) return { kind: "empty", text: t("webhookBody.k0") };
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object")
      return { kind: "invalid", text: t("webhookBody.k1") };
    return { kind: "valid", text: t("webhookBody.k2") };
  } catch {
    return { kind: "invalid", text: t("webhookBody.k3") };
  }
});
const canFormat = computed(() => isJson.value && jsonStatus.value.kind === "valid");
const editorExtensions = computed<Extension[]>(() => [
  highlightActiveLine(),
  EditorView.theme({
    "&": { fontSize: "13px" },
    ".cm-scroller": {
      lineHeight: "1.55",
      fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
    },
    ".cm-content": { padding: "10px 12px" },
  }),
]);

function formatJson() {
  if (!canFormat.value) return;
  try {
    emit("update:modelValue", JSON.stringify(JSON.parse(props.modelValue), null, 2));
  } catch {
    // The status bar already reports invalid JSON; formatting leaves the source unchanged.
  }
}
// Only fills the default shown as the placeholder; never formats or rewrites existing content.
function insertSample() {
  if (props.sample) emit("update:modelValue", props.sample);
}
</script>

<template>
  <div
    class="json-editor"
    :class="{ invalid: props.invalid || (isJson && jsonStatus.kind === 'invalid') }"
  >
    <div class="json-editor-toolbar">
      <div class="json-editor-language">
        <span class="language-dot" aria-hidden="true"></span><span>{{ isJson ? "JSON" : "TEXT" }}</span>
      </div>
      <div class="json-editor-actions">
        <button
          v-if="isJson"
          type="button"
          class="editor-action"
          :disabled="!canFormat"
          :title="canFormat ? t('webhookBody.k4') : jsonStatus.text"
          @click="formatJson"
        >
          {{ t("webhookBody.k5") }}
        </button>
        <button
          v-if="props.sample"
          type="button"
          class="editor-action"
          :title="t('webhookBody.k6')"
          @click="insertSample"
        >
          {{ t("webhookBody.k6") }}
        </button>
      </div>
    </div>
    <CodeMirrorField
      :model-value="props.modelValue"
      :placeholder="shownPlaceholder"
      :height="props.height"
      :language="props.language"
      :line-numbers="props.lineNumbers"
      :aria-label="props.ariaLabel"
      theme="one-dark"
      embedded
      :invalid="props.invalid || (isJson && jsonStatus.kind === 'invalid')"
      :extensions="editorExtensions"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div
      v-if="isJson"
      class="json-editor-status"
      :class="jsonStatus.kind"
      role="status"
      aria-live="polite"
    >
      <span class="status-indicator" aria-hidden="true"></span>{{ jsonStatus.text }}
    </div>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.json-editor {
  @apply overflow-hidden rounded-[var(--radius-sm)] border transition-colors;
  border-color: var(--line);
  background: var(--bg);
}
.json-editor:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.json-editor.invalid {
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}
.json-editor-toolbar {
  @apply flex min-h-10 items-center justify-between gap-2.5 border-b px-[10px] py-1.5;
  border-color: var(--line);
  background: var(--surface-2);
}
.json-editor-language,
.json-editor-actions {
  @apply flex items-center gap-2;
}
.json-editor-language {
  @apply font-mono text-[11px] font-semibold tracking-[0.06em];
  color: var(--muted);
}
.language-dot {
  @apply h-[7px] w-[7px] rounded-full;
  background: var(--accent);
}
.editor-action {
  @apply min-h-7 cursor-pointer rounded-md border px-[9px] py-[3px] text-[11px] font-semibold appearance-none;
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
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
  @apply cursor-not-allowed opacity-100;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
}
.json-editor-status {
  @apply flex min-h-[30px] items-center gap-2 border-t px-[10px] py-1.5 text-[11px] leading-snug;
  border-color: var(--line);
  color: var(--muted);
}
.status-indicator {
  @apply h-[7px] w-[7px] shrink-0 rounded-full;
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
    @apply flex-col items-start;
  }
  .json-editor-actions {
    @apply w-full justify-end;
  }
}
</style>
