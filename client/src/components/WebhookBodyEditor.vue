<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { json } from "@codemirror/lang-json";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    sample?: string;
    height?: number;
    emptyHint?: string;
    invalid?: boolean;
  }>(),
  {
    placeholder: "",
    sample: "",
    height: 220,
    emptyHint: "留空时使用默认 JSON 请求体。",
    invalid: false,
  }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let themeObserver: MutationObserver | null = null;

const jsonStatus = computed(() => {
  const raw = props.modelValue.trim();
  if (!raw) return { kind: "empty", text: props.emptyHint };
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object")
      return { kind: "invalid", text: "JSON 顶层必须是对象或数组。" };
    return { kind: "valid", text: "JSON 格式正确" };
  } catch {
    return { kind: "invalid", text: "JSON 语法错误，请检查括号、引号和逗号。" };
  }
});
const canFormat = computed(() => jsonStatus.value.kind === "valid");

function isDark(): boolean {
  return document.documentElement.classList.contains("theme-dark");
}
function buildExtensions(dark: boolean) {
  const base = [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    json(),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit("update:modelValue", update.state.doc.toString());
    }),
    EditorView.theme({
      "&": { height: `${props.height}px`, maxHeight: `${props.height}px`, fontSize: "13px" },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
        lineHeight: "1.55",
      },
      ".cm-content": { padding: "10px 0" },
      "&.cm-focused": { outline: "none" },
    }),
  ];
  if (dark) base.push(oneDark);
  return base;
}
function mountEditor() {
  if (!host.value) return;
  const doc = view ? view.state.doc.toString() : props.modelValue || "";
  const selection = view ? view.state.selection.main.head : 0;
  view?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc, extensions: buildExtensions(isDark()) }),
  });
  view.dispatch({ selection: { anchor: Math.min(selection, view.state.doc.length) } });
}
function replaceDocument(value: string) {
  if (!view) {
    emit("update:modelValue", value);
    return;
  }
  const current = view.state.doc.toString();
  if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
}
function formatJson() {
  if (!canFormat.value) return;
  try {
    replaceDocument(JSON.stringify(JSON.parse(props.modelValue), null, 2));
  } catch {
    // 状态栏已提示格式错误；格式化操作不修改原文。
  }
}
function insertSample() {
  if (props.sample) replaceDocument(props.sample);
}
onMounted(() => {
  mountEditor();
  themeObserver = new MutationObserver(() => mountEditor());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});
onBeforeUnmount(() => {
  themeObserver?.disconnect();
  view?.destroy();
  view = null;
});
watch(
  () => props.modelValue,
  (value) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current)
      view.dispatch({ changes: { from: 0, to: current.length, insert: value || "" } });
  }
);
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
          :title="canFormat ? '格式化 JSON' : jsonStatus.text"
          @click="formatJson"
        >
          格式化
        </button>
        <button v-if="sample" type="button" class="editor-action" @click="insertSample">
          填入示例
        </button>
      </div>
    </div>
    <div class="json-editor-frame" :style="{ height: height + 'px' }">
      <div ref="host" class="cm-host"></div>
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
.cm-host,
.cm-host :deep(.cm-editor) {
  height: 100%;
  background: transparent;
}
.cm-host :deep(.cm-scroller) {
  overflow: auto !important;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.cm-host :deep(.cm-gutters) {
  background: var(--surface-2);
  border-right: 1px solid var(--line);
  color: var(--muted);
}
.cm-host :deep(.cm-content) {
  min-height: 100%;
}
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
