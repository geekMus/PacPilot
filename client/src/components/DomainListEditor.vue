<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    minHeight?: number;
  }>(),
  { placeholder: "", minHeight: 200 }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let themeObs: MutationObserver | null = null;

function isDark(): boolean {
  return document.documentElement.classList.contains("theme-dark");
}

function buildExtensions(dark: boolean) {
  const base = [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        emit("update:modelValue", u.state.doc.toString());
      }
    }),
    EditorView.theme({
      "&": {
        minHeight: `${props.minHeight}px`,
        height: "100%",
        fontSize: "13px",
      },
      ".cm-scroller": {
        fontFamily:
          'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
        lineHeight: "1.5",
        overflow: "auto",
      },
      ".cm-content": {
        minHeight: `${props.minHeight - 8}px`,
        padding: "10px 0",
      },
      "&.cm-focused": { outline: "none" },
    }),
  ];
  if (dark) base.push(oneDark);
  return base;
}

function mountEditor() {
  if (!host.value) return;
  const doc = view ? view.state.doc.toString() : props.modelValue || "";
  const sel = view ? view.state.selection.main.head : 0;
  view?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc,
      extensions: buildExtensions(isDark()),
    }),
  });
  view.dispatch({
    selection: { anchor: Math.min(sel, view.state.doc.length) },
  });
}

onMounted(() => {
  mountEditor();
  themeObs = new MutationObserver(() => mountEditor());
  themeObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

onBeforeUnmount(() => {
  themeObs?.disconnect();
  view?.destroy();
  view = null;
});

watch(
  () => props.modelValue,
  (v) => {
    if (!view) return;
    const cur = view.state.doc.toString();
    if (v !== cur) {
      view.dispatch({
        changes: { from: 0, to: cur.length, insert: v || "" },
      });
    }
  }
);
</script>

<template>
  <div class="editor-shell" :style="{ minHeight: minHeight + 'px' }">
    <div ref="host" class="cm-host" />
    <div v-if="!modelValue && placeholder" class="ph">{{ placeholder }}</div>
  </div>
</template>

<style scoped>
.editor-shell {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg);
  overflow: hidden;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
}

.cm-host {
  flex: 1;
  min-height: inherit;
}

.cm-host :deep(.cm-editor) {
  height: 100%;
  background: transparent;
}

.cm-host :deep(.cm-gutters) {
  background: var(--surface-2);
  border-right: 1px solid var(--line);
  color: var(--muted);
}

.ph {
  position: absolute;
  top: 12px;
  left: 48px;
  color: var(--muted);
  font-size: 13px;
  font-family: ui-monospace, Consolas, monospace;
  pointer-events: none;
  white-space: pre-line;
  opacity: 0.75;
}
</style>
