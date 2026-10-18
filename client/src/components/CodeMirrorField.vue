<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { json } from "@codemirror/lang-json";

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  height?: number;
  singleLine?: boolean;
  language?: "json" | "text";
  ariaLabel?: string;
}>(), {
  placeholder: "",
  height: 160,
  singleLine: false,
  language: "text",
  ariaLabel: "文本编辑器",
});
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

function buildExtensions() {
  const bindings = [
    ...(props.singleLine ? [{ key: "Enter", run: () => true }] : []),
    ...defaultKeymap,
    ...historyKeymap,
  ];
  return [
    history(),
    keymap.of(bindings),
    syntaxHighlighting(defaultHighlightStyle),
    ...(props.language === "json" ? [json()] : []),
    ...(props.placeholder ? [cmPlaceholder(props.placeholder)] : []),
    ...(!props.singleLine ? [EditorView.lineWrapping] : []),
    EditorView.contentAttributes.of({
      "aria-label": props.ariaLabel,
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const value = update.state.doc.toString();
      if (props.singleLine && /[\r\n]/.test(value)) {
        const normalized = value.replace(/[\r\n]+/g, " ");
        update.view.dispatch({
          changes: { from: 0, to: update.state.doc.length, insert: normalized },
        });
        return;
      }
      emit("update:modelValue", value);
    }),
    EditorView.theme({
      "&": {
        height: props.height + "px",
        maxHeight: props.height + "px",
        background: "transparent",
        color: "var(--text)",
        fontSize: "12px",
      },
      ".cm-scroller": {
        overflow: props.singleLine ? "hidden" : "auto",
        fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
        lineHeight: "1.5",
      },
      ".cm-content": { padding: props.singleLine ? "10px 10px" : "10px 0" },
      ".cm-line": { padding: "0" },
      ".cm-gutters": { display: "none" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
      ".cm-selectionBackground": { background: "var(--accent-soft)" },
      "&.cm-focused": { outline: "none" },
    }),
  ];
}

function mountEditor() {
  if (!host.value) return;
  const current = view;
  const doc = current ? current.state.doc.toString() : props.modelValue || "";
  const selection = current ? current.state.selection.main.head : 0;
  current?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc, extensions: buildExtensions() }),
  });
  view.dispatch({ selection: { anchor: Math.min(selection, view.state.doc.length) } });
}

onMounted(mountEditor);
onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});
watch(() => props.modelValue, (value) => {
  if (!view) return;
  const current = view.state.doc.toString();
  const next = value || "";
  if (current !== next) view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
});
</script>

<template>
  <div class="cm-field-frame" :class="{ 'single-line': singleLine }">
    <div ref="host" class="cm-field-host"></div>
  </div>
</template>

<style scoped>
.cm-field-frame {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  transition: border-color .15s, box-shadow .15s;
}
.cm-field-frame:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.cm-field-frame.single-line { height: 40px; }
.cm-field-host { width: 100%; }
.cm-field-host :deep(.cm-editor) { width: 100%; background: transparent; }
.cm-field-host :deep(.cm-scroller) {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.cm-field-host :deep(.cm-scroller::-webkit-scrollbar) { width: var(--scrollbar-size); }
.cm-field-host :deep(.cm-scroller::-webkit-scrollbar-thumb) {
  background: var(--scrollbar-thumb);
  border-radius: 999px;
}
</style>
