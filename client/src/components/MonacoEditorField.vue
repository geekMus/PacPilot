<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isDarkTheme, loadMonaco } from "@/utils/monaco-editor";
const { t } = useI18n();
const props = withDefaults(defineProps<{
  modelValue: string; placeholder?: string; height?: number; singleLine?: boolean;
  language?: "json" | "text"; ariaLabel?: string; invalid?: boolean; lineNumbers?: boolean;
}>(), { placeholder: "", height: 160, singleLine: false, language: "text", ariaLabel: "", invalid: false, lineNumbers: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const host = ref<HTMLDivElement | null>(null);
type Editor = import("monaco-editor/esm/vs/editor/editor.api").editor.IStandaloneCodeEditor;
let editor: Editor | null = null;
let observer: MutationObserver | null = null;
let subscription: { dispose(): void } | null = null;
let disposed = false;
async function mount() {
  const target = host.value;
  if (!target) return;
  const m = await loadMonaco();
  if (disposed || host.value !== target) return;
  editor = m.editor.create(target, {
    value: props.modelValue || "", language: props.language === "json" ? "json" : "plaintext",
    theme: isDarkTheme() ? "pacpilot-dark" : "pacpilot-light", automaticLayout: true,
    ariaLabel: props.ariaLabel || t("editor.textEditor"), minimap: { enabled: false },
    overviewRulerLanes: 0, overviewRulerBorder: false, glyphMargin: false, folding: false,
    lineNumbers: props.lineNumbers ? "on" : "off", lineNumbersMinChars: props.lineNumbers ? 3 : 0,
    lineDecorationsWidth: props.lineNumbers ? 8 : 0, renderLineHighlight: "none", scrollBeyondLastLine: false,
    wordWrap: props.singleLine ? "off" : "on", wrappingStrategy: "advanced",
    fontSize: props.lineNumbers ? 13 : 12, fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
    lineHeight: props.lineNumbers ? 20 : 18, padding: { top: 10, bottom: 10 },
    scrollbar: { vertical: props.singleLine ? "hidden" : "visible", horizontal: props.singleLine ? "hidden" : "visible",
      verticalScrollbarSize: 12, horizontalScrollbarSize: 10, useShadows: false, verticalHasArrows: false,
      horizontalHasArrows: false, alwaysConsumeMouseWheel: false },
    contextmenu: true, quickSuggestions: false, suggestOnTriggerCharacters: false,
  });
  subscription = editor.onDidChangeModelContent(() => {
    if (!editor) return;
    let value = editor.getValue();
    if (props.singleLine) value = value.replace(/[\r\n]+/g, " ");
    if (value !== editor.getValue()) editor.setValue(value);
    if (value !== props.modelValue) emit("update:modelValue", value);
  });
}
onMounted(() => {
  void mount();
  observer = new MutationObserver(() => editor?.updateOptions({ theme: isDarkTheme() ? "pacpilot-dark" : "pacpilot-light" }));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); subscription?.dispose(); editor?.dispose(); editor = null; });
watch(() => props.modelValue, value => { if (editor && editor.getValue() !== (value || "")) editor.setValue(value || ""); });
watch(() => [props.height, props.singleLine, props.language, props.lineNumbers] as const, ([height, singleLine, language, lineNumbers]) => {
  if (!editor) return;
  editor.updateOptions({ wordWrap: singleLine ? "off" : "on", lineNumbers: lineNumbers ? "on" : "off",
    lineNumbersMinChars: lineNumbers ? 3 : 0, lineDecorationsWidth: lineNumbers ? 8 : 0,
    fontSize: lineNumbers ? 13 : 12, lineHeight: lineNumbers ? 20 : 18,
    scrollbar: { vertical: singleLine ? "hidden" : "visible", horizontal: singleLine ? "hidden" : "visible",
      verticalScrollbarSize: 12, horizontalScrollbarSize: 10, useShadows: false, verticalHasArrows: false,
      horizontalHasArrows: false, alwaysConsumeMouseWheel: false } });
  const model = editor.getModel();
  if (model) void loadMonaco().then(m => m.editor.setModelLanguage(model, language === "json" ? "json" : "plaintext"));
  if (host.value) host.value.style.height = `${height}px`;
  editor.layout();
}, { flush: "post" });
</script>
<template>
  <div class="monaco-field-frame" :class="{ 'single-line': singleLine, invalid }">
    <div ref="host" class="monaco-field-host" :style="{ height: height + 'px' }"></div>
    <div v-if="!modelValue && placeholder" class="monaco-placeholder" :class="{ 'with-line-numbers': lineNumbers }">{{ placeholder }}</div>
  </div>
</template>
<style scoped>
.monaco-field-frame { position: relative; box-sizing: border-box; width: 100%; min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); transition: border-color .15s, box-shadow .15s; }
.monaco-field-frame:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.monaco-field-frame.invalid, .monaco-field-frame.invalid:focus-within { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.monaco-field-frame.single-line { height: 40px; }
.monaco-field-host { width: 100%; min-width: 0; }
.monaco-field-host :deep(.monaco-editor), .monaco-field-host :deep(.monaco-editor .overflow-guard) { width: 100%; background: transparent; }
.monaco-field-host :deep(.monaco-editor .scrollbar.vertical) { width: 12px !important; right: 0; }
.monaco-field-host :deep(.monaco-editor .scrollbar.horizontal) { height: 10px !important; }
.monaco-field-host :deep(.monaco-editor .slider) { border-radius: 999px; }
.monaco-field-host :deep(.monaco-editor .scrollbar .slider) { background: var(--scrollbar-thumb); }
.monaco-field-host :deep(.monaco-editor .scrollbar .slider:hover) { background: var(--scrollbar-thumb-hover); }
.monaco-placeholder { position: absolute; top: 10px; left: 12px; right: 20px; color: var(--muted); opacity: .72; pointer-events: none; font: 12px/1.5 var(--font-mono); }
.monaco-placeholder.with-line-numbers { left: 48px; font-size: 13px; }
</style>
