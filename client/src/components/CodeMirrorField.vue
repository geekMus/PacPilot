<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting as addSyntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { oneDarkHighlightStyle, oneDarkTheme } from "@codemirror/theme-one-dark";
import AppScrollArea from "@/components/AppScrollArea.vue";
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
    language?: "json" | "text";
    ariaLabel?: string;
    invalid?: boolean;
    extensions?: Extension[];
    theme?: "app" | "one-dark";
    embedded?: boolean;
    scrollbarMode?: "hover" | "auto";
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
    scrollbarMode: "auto",
  }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let themeObserver: MutationObserver | null = null;
let contentObserver: ResizeObserver | null = null;

function syncScrollableContentHeight(): void {
  if (props.singleLine || !view || !host.value) return;
  const content = view.dom.querySelector<HTMLElement>(".cm-content");
  if (!content) return;
  // Keep the direct ScrollArea child sized to CodeMirror content so Reka UI
  // recalculates its scrollbar while typing, without requiring blur/refocus.
  const contentHeight = Math.max(content.scrollHeight, view.dom.scrollHeight);
  host.value.style.minHeight = String(Math.max(props.height - 2, contentHeight)) + "px";
}

function observeScrollableContent(): void {
  contentObserver?.disconnect();
  contentObserver = null;
  if (props.singleLine || !view) return;
  const content = view.dom.querySelector<HTMLElement>(".cm-content");
  if (!content) return;
  contentObserver = new ResizeObserver(syncScrollableContentHeight);
  contentObserver.observe(content);
  syncScrollableContentHeight();
}

function isDark(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.classList.contains("theme-dark")
  );
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
      ? [
          oneDarkTheme,
          ...(props.syntaxHighlighting ? [addSyntaxHighlighting(oneDarkHighlightStyle)] : []),
        ]
      : []),
    ...(props.language === "json" ? [json()] : []),
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
        // 单行模式下把换行折成空格，并把归一化后的值同步给父组件；
        // 少了这次 emit，父层拿到的还是粘贴前的旧值。
        const normalized = value.replace(/[\r\n]+/g, " ");
        update.view.dispatch({
          changes: { from: 0, to: update.state.doc.length, insert: normalized },
        });
        emit("update:modelValue", normalized);
        return;
      }
      emit("update:modelValue", value);
    }),
    EditorView.theme({
      "&": {
        ...(props.singleLine
          ? { height: "100%", maxHeight: "100%" }
          : { minHeight: Math.max(0, props.height - 2) + "px" }),
        background: "transparent",
        color: "var(--text)",
        fontSize: "12px",
      },
      ".cm-scroller": {
        overflow: props.singleLine ? "hidden" : "visible",
        fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
        lineHeight: "1.5",
      },
      ".cm-content": { padding: "10px 12px" },
      ".cm-line": { padding: "0" },
      ".cm-gutters": {
        background: "var(--surface-2)",
        borderRight: "1px solid var(--line)",
        color: "var(--muted)",
      },
      // CodeMirror ships its own grey (#888), which lands at 3.24:1 on our
      // surfaces — below WCAG AA. Use the muted token instead (4.58:1).
      // pre-wrap keeps multi-line placeholder templates readable.
      ".cm-placeholder": { color: "var(--muted)", fontStyle: "normal", whiteSpace: "pre-wrap" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
      ".cm-selectionBackground": { background: "var(--accent-soft)" },
      "&.cm-focused": { outline: "none" },
    }),
    ...props.extensions,
  ];
}

function mountEditor() {
  if (!host.value) return;
  contentObserver?.disconnect();
  contentObserver = null;
  host.value.style.minHeight = "";
  const current = view;
  const doc = current ? current.state.doc.toString() : props.modelValue || "";
  const selection = current ? current.state.selection.main.head : 0;
  current?.destroy();
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc, extensions: buildExtensions() }),
  });
  view.dispatch({ selection: { anchor: Math.min(selection, view.state.doc.length) } });
  observeScrollableContent();
}

onMounted(() => {
  mountEditor();
  themeObserver = new MutationObserver(() => {
    if (props.theme === "one-dark") mountEditor();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

defineExpose({ getEditorView: () => view });
onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  contentObserver?.disconnect();
  contentObserver = null;
  view?.destroy();
  view = null;
});
watch(
  () => [
    props.singleLine,
    props.lineNumbers,
    props.syntaxHighlighting,
    props.readOnly,
    props.language,
    props.height,
    props.placeholder,
    props.extensions,
    props.theme,
  ],
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
    :style="
      !singleLine ? { height: `${height}px`, '--cm-editor-height': `${height}px` } : undefined
    "
  >
    <AppScrollArea
      v-if="!singleLine"
      root-class="cm-field-scroll-area"
      viewport-class="cm-field-scroll-viewport"
      orientation="vertical"
      :type="scrollbarMode"
    >
      <div ref="host" class="cm-field-host cm-field-host-scrollable"></div>
    </AppScrollArea>
    <div v-else ref="host" class="cm-field-host"></div>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.cm-field-frame {
  @apply box-border w-full min-w-0 overflow-hidden rounded-lg border transition-[border-color,box-shadow];
  border-color: var(--line);
  background: var(--bg);
}
.cm-field-frame.embedded {
  @apply rounded-none border-0 shadow-none transition-none;
}
.cm-field-frame.embedded:focus-within {
  @apply border-0 shadow-none;
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
  @apply border-0 shadow-none;
}
.cm-field-frame.single-line {
  @apply h-10;
}
.cm-field-scroll-area {
  @apply h-full w-full max-w-full min-w-0;
}
:deep(.cm-field-scroll-viewport) {
  @apply relative overflow-auto;
  /* Chain vertical gestures to the page when the editor has no remaining scroll. */
  overscroll-behavior-y: auto;
  overscroll-behavior-x: contain;
}
.cm-field-host-scrollable {
  @apply min-h-full;
}
.cm-field-frame.single-line .cm-field-host {
  @apply h-full min-h-0;
}

/*
  单行控件不是滚动容器，但长内容仍要能横向滚动并保持光标可见：
  CodeMirror 把 .cm-content 设成 flex: 2 0 auto + white-space: pre，
  内容比容器宽时既不会收缩也无法滚动，文字会被直接裁掉。
*/
.cm-field-frame.single-line .cm-field-host :deep(.cm-editor) {
  @apply box-border h-full max-h-full w-full min-h-0 overflow-hidden;
}
.cm-field-frame.single-line .cm-field-host :deep(.cm-scroller) {
  @apply box-border h-full max-h-full w-full min-h-0 overflow-x-auto overflow-y-hidden;
}
.cm-field-frame.single-line .cm-field-host :deep(.cm-content) {
  @apply min-w-0 flex-shrink whitespace-nowrap;
}
/*
  CodeMirror 的占位提示是行内块，且与光标占位符同处一行。把它改成 block
  会让该行撑成三行高、占位下坠到输入框底边之外，视觉上就是文字被切掉一半。
  这里保持默认的 inline-block，只用省略号截断超长占位。
*/
.cm-field-frame.single-line .cm-field-host :deep(.cm-placeholder) {
  @apply inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap align-top;
}
.cm-field-host {
  @apply w-full min-w-0 max-w-full;
}
.cm-field-host :deep(.cm-editor) {
  @apply w-full bg-transparent;
}
.cm-field-host :deep(.cm-gutters) {
  @apply border-r;
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--muted);
}
</style>
