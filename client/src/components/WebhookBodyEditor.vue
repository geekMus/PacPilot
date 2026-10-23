<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { json } from "@codemirror/lang-json";
import AppScrollArea from "@/components/AppScrollArea.vue";
import { attachCodeMirrorScrollArea } from "@/utils/codemirror-scroll-area";
const { t } = useI18n();

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
    invalid: false,
  }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const host = ref<HTMLDivElement | null>(null);
const spacer = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let scrollViewport: HTMLElement | null = null;
let disposeScrollSync: (() => void) | null = null;
let themeObserver: MutationObserver | null = null;

function connectScrollArea(element?: HTMLElement) {
  if (element) scrollViewport = element;
  disposeScrollSync?.();
  disposeScrollSync = null;
  if (view && scrollViewport && spacer.value) {
    disposeScrollSync = attachCodeMirrorScrollArea(view, scrollViewport, spacer.value);
  }
}

const jsonStatus = computed(() => {
  const raw = props.modelValue.trim();
  if (!raw) return { kind: "empty", text: props.emptyHint ?? t("webhookBody.k0") };
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object")
      return { kind: "invalid", text: t("webhookBody.k1") };
    return { kind: "valid", text: t("webhookBody.k2") };
  } catch {
    return { kind: "invalid", text: t("webhookBody.k3") };
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
  disposeScrollSync?.();
  disposeScrollSync = null;
  view?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc, extensions: buildExtensions(isDark()) }),
  });
  view.dispatch({ selection: { anchor: Math.min(selection, view.state.doc.length) } });
  connectScrollArea();
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
    // The status bar already reports invalid JSON; formatting leaves the source unchanged.
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
  disposeScrollSync?.();
  disposeScrollSync = null;
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
      <AppScrollArea
        root-class="json-editor-scroll-area"
        viewport-class="json-editor-scroll-viewport"
        orientation="both"
        type="hover"
        @ready="connectScrollArea"
      >
        <div
          ref="host"
          class="cm-host cm-host-scrollable"
          :style="{ '--cm-editor-height': `${height}px` }"
        ></div>
        <div ref="spacer" class="cm-scroll-spacer" aria-hidden="true"></div>
      </AppScrollArea>
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
.json-editor-scroll-area {
  width: 100%;
  height: 100%;
}
.json-editor-scroll-viewport {
  position: relative;
  overflow: auto;
}
.cm-host-scrollable {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 1;
  margin-bottom: calc(-1 * var(--cm-editor-height));
}
.cm-scroll-spacer {
  min-width: 100%;
  min-height: 100%;
  pointer-events: none;
}
.cm-host,
.cm-host :deep(.cm-editor) {
  height: 100%;
  background: transparent;
}
.cm-host :deep(.cm-scroller) {
  overflow: auto !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.cm-host :deep(.cm-scroller::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}
.cm-host :deep(.cm-gutters) {
  background: var(--surface-2);
  border-right: 1px solid var(--line);
  color: var(--muted);
}
.cm-host :deep(.cm-content) {
  min-height: 100%;
  padding: 10px 12px;
}
.json-placeholder {
  position: absolute;
  z-index: 2;
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
