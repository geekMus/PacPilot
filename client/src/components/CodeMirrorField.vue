<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting as addSyntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { java } from "@codemirror/lang-java";
import { oneDarkHighlightStyle, oneDarkTheme } from "@codemirror/theme-one-dark";
import AppScrollArea from "@/components/AppScrollArea.vue";
import { attachCodeMirrorScrollArea } from "@/utils/codemirror-scroll-area";
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    height?: number;
    singleLine?: boolean;
    lineNumbers?: boolean;
    syntaxHighlighting?: boolean;
    readOnly?: boolean;
    language?: "json" | "javascript" | "java" | "text";
    ariaLabel?: string;
    invalid?: boolean;
    extensions?: Extension[];
    theme?: "app" | "one-dark";
    embedded?: boolean;
  }>(),
  {
    placeholder: "",
    height: 160,
    singleLine: false,
    lineNumbers: true,
    syntaxHighlighting: true,
    readOnly: false,
    language: "text",
    ariaLabel: "", // i18n
    invalid: false,
    extensions: () => [],
    theme: "app",
    embedded: false,
  }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const host = ref<HTMLDivElement | null>(null);
const spacer = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let scrollViewport: HTMLElement | null = null;
let disposeScrollSync: (() => void) | null = null;
let themeObserver: MutationObserver | null = null;

function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("theme-dark");
}

function connectScrollArea(element?: HTMLElement) {
  if (element) scrollViewport = element;
  disposeScrollSync?.();
  disposeScrollSync = null;
  if (!props.singleLine && view && scrollViewport && spacer.value) {
    disposeScrollSync = attachCodeMirrorScrollArea(view, scrollViewport, spacer.value);
  }
}

function buildExtensions() {
  const bindings = [
    ...(props.singleLine ? [{ key: "Enter", run: () => true }] : []),
    ...defaultKeymap,
    ...historyKeymap,
  ];
  return [
    history(),
    ...(!props.singleLine && props.lineNumbers ? [lineNumbers()] : []),
    keymap.of(bindings),
    ...(props.syntaxHighlighting ? [addSyntaxHighlighting(defaultHighlightStyle)] : []),
    ...(props.theme === "one-dark" && isDark()
      ? [oneDarkTheme, ...(props.syntaxHighlighting ? [addSyntaxHighlighting(oneDarkHighlightStyle)] : [])]
      : []),
    ...(props.language === "json"
      ? [json()]
      : props.language === "javascript"
        ? [javascript()]
        : props.language === "java"
          ? [java()]
          : []),
    ...(props.placeholder ? [cmPlaceholder(props.placeholder)] : []),
    ...(!props.singleLine ? [EditorView.lineWrapping] : []),
    EditorView.contentAttributes.of({
      "aria-label": props.ariaLabel || t("editor.textEditor"),
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
    }),
    EditorState.readOnly.of(props.readOnly),
    EditorView.editable.of(!props.readOnly),
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
      ".cm-content": { padding: "10px 12px" },
      ".cm-line": { padding: "0" },
      ".cm-gutters": { background: "var(--surface-2)", borderRight: "1px solid var(--line)", color: "var(--muted)" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
      ".cm-selectionBackground": { background: "var(--accent-soft)" },
      "&.cm-focused": { outline: "none" },
    }),
    ...props.extensions,
  ];
}

function mountEditor() {
  if (!host.value) return;
  const current = view;
  const doc = current ? current.state.doc.toString() : props.modelValue || "";
  const selection = current ? current.state.selection.main.head : 0;
  disposeScrollSync?.();
  disposeScrollSync = null;
  current?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc, extensions: buildExtensions() }),
  });
  view.dispatch({ selection: { anchor: Math.min(selection, view.state.doc.length) } });
  connectScrollArea();
}

onMounted(() => {
  mountEditor();
  if (props.theme === "one-dark") {
    themeObserver = new MutationObserver(() => mountEditor());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
});

defineExpose({ getEditorView: () => view });
onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  disposeScrollSync?.();
  disposeScrollSync = null;
  view?.destroy();
  view = null;
});
watch(
  () => [props.singleLine, props.lineNumbers, props.syntaxHighlighting, props.readOnly, props.language, props.height, props.placeholder, props.extensions, props.theme],
  () => mountEditor()
);
watch(
  () => props.modelValue,
  (value) => {
    if (!view) return;
    const current = view.state.doc.toString();
    const next = value || "";
    if (current !== next) view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
  }
);
</script>

<template>
  <div
    class="cm-field-frame"
    :class="{ 'single-line': singleLine, invalid, embedded }"
    :style="!singleLine ? { height: `${height}px`, '--cm-editor-height': `${height}px` } : undefined"
  >
    <AppScrollArea
      v-if="!singleLine"
      root-class="cm-field-scroll-area"
      viewport-class="cm-field-scroll-viewport"
      orientation="both"
      type="hover"
      @ready="connectScrollArea"
    >
      <div ref="host" class="cm-field-host cm-field-host-scrollable"></div>
      <div ref="spacer" class="cm-field-scroll-spacer" aria-hidden="true"></div>
    </AppScrollArea>
    <div v-else ref="host" class="cm-field-host"></div>
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
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.cm-field-frame.embedded {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transition: none;
}
.cm-field-frame.embedded:focus-within {
  border: 0;
  box-shadow: none;
}
.cm-field-frame:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.cm-field-frame.invalid,
.cm-field-frame.invalid:focus-within {
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}
.cm-field-frame.embedded.invalid,
.cm-field-frame.embedded.invalid:focus-within {
  border: 0;
  box-shadow: none;
}
.cm-field-frame.single-line {
  height: 40px;
}
.cm-field-scroll-area {
  width: 100%;
  height: 100%;
}
:deep(.cm-field-scroll-viewport) {
  position: relative;
  overflow: auto;
}
.cm-field-host-scrollable {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 1;
  margin-bottom: calc(-1 * var(--cm-editor-height));
}
.cm-field-scroll-spacer {
  min-width: 100%;
  min-height: 100%;
  pointer-events: none;
}
.cm-field-host {
  width: 100%;
}
.cm-field-host :deep(.cm-editor) {
  width: 100%;
  background: transparent;
}
.cm-field-host :deep(.cm-gutters) {
  background: var(--surface-2);
  border-right: 1px solid var(--line);
  color: var(--muted);
}
.cm-field-host :deep(.cm-scroller) {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.cm-field-host :deep(.cm-scroller::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}
</style>
