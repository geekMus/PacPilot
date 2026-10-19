<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  Decoration,
  WidgetType,
} from "@codemirror/view";
import { EditorState, StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import type { RuleDiagnostic } from "../utils/domain-rules";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    invalid?: boolean;
    diagnostics?: RuleDiagnostic[];
    /** 固定高度（px），内容超出时在编辑器内滚动 */
    height?: number;
  }>(),
  { placeholder: "", height: 320, invalid: false, diagnostics: () => [] }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const setRuleDiagnostics = StateEffect.define<RuleDiagnostic[]>();
const setJumpHighlight = StateEffect.define<{ line: number; token: number } | null>();
const jumpHighlightField = StateField.define<{ line: number; token: number } | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setJumpHighlight)) value = effect.value;
    if (transaction.docChanged && value !== null) {
      const pos = transaction.changes.mapPos(transaction.startState.doc.line(Math.min(value.line, transaction.startState.doc.lines)).from);
      value = { ...value, line: transaction.state.doc.lineAt(Math.min(pos, transaction.state.doc.length)).number };
    }
    return value;
  },
});
const ruleDiagnosticsField = StateField.define<RuleDiagnostic[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setRuleDiagnostics)) value = effect.value;
    return value;
  },
});
class InlineDiagnosticWidget extends WidgetType {
  constructor(readonly diagnostics: RuleDiagnostic[]) { super(); }
  eq(other: InlineDiagnosticWidget) {
    return this.diagnostics.length === other.diagnostics.length &&
      this.diagnostics.every((item, index) => item.line === other.diagnostics[index]?.line && item.severity === other.diagnostics[index]?.severity && item.message === other.diagnostics[index]?.message);
  }
  toDOM() {
    const container = document.createElement("span");
    const severity = this.diagnostics.some((item) => item.severity === "error") ? "error" : this.diagnostics.some((item) => item.severity === "warning") ? "warning" : "info";
    container.className = "cm-inline-diagnostic is-" + severity;
    container.setAttribute("role", "status");
    const label = document.createElement("span");
    label.className = "cm-inline-diagnostic-label";
    label.textContent = severity === "error" ? "错误" : severity === "warning" ? "提醒" : "建议";
    container.append(label);
    const message = document.createElement("span");
    message.className = "cm-inline-diagnostic-message";
    message.textContent = this.diagnostics.map((item) => item.message).join(" · ");
    container.append(message);
    return container;
  }
}
const ruleDecorationField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    const diagnosticsChanged = transaction.effects.some((effect) => effect.is(setRuleDiagnostics));
    const highlightChanged = transaction.effects.some((effect) => effect.is(setJumpHighlight));
    if (!transaction.docChanged && !diagnosticsChanged && !highlightChanged && !transaction.selectionSet) return decorations.map(transaction.changes);
    const diagnostics = transaction.state.field(ruleDiagnosticsField);
    const byLine = new Map<number, RuleDiagnostic[]>();
    for (const diagnostic of diagnostics) byLine.set(diagnostic.line, [...(byLine.get(diagnostic.line) ?? []), diagnostic]);
    const highlight = transaction.state.field(jumpHighlightField);
    const highlightLine = highlight?.line ?? null;
    const activeLine = transaction.state.doc.lineAt(transaction.state.selection.main.head).number;
    const lineNumbersToDecorate = new Set([...byLine.keys()]);
    if (highlightLine !== null) lineNumbersToDecorate.add(highlightLine);
    if (byLine.has(activeLine)) lineNumbersToDecorate.add(activeLine);
    const ranges = [];
    for (const lineNumber of lineNumbersToDecorate) {
      if (lineNumber < 1 || lineNumber > transaction.state.doc.lines) continue;
      const items = byLine.get(lineNumber) ?? [];
      const classes: string[] = [];
      if (items.length) {
        const severity = items.some((item) => item.severity === "error") ? "error" : items.some((item) => item.severity === "warning") ? "warning" : "info";
        classes.push("cm-rule-line-" + severity);
      }
      const targetColor = items.some((item) => item.severity === "error") ? "var(--red)" : items.some((item) => item.severity === "warning") ? "var(--warn)" : items.length ? "var(--accent)" : "transparent";
      if (highlightLine === lineNumber) classes.push(highlight.token % 2 === 0 ? "cm-jump-highlight-a" : "cm-jump-highlight-b");
      ranges.push(Decoration.line({ attributes: { class: classes.join(" "), style: "--cm-jump-target: " + targetColor + ";" } }).range(transaction.state.doc.line(lineNumber).from));
      if (lineNumber === activeLine && items.length) ranges.push(Decoration.widget({ widget: new InlineDiagnosticWidget(items), side: 1, block: false }).range(transaction.state.doc.line(lineNumber).to));
    }
    ranges.sort((a, b) => a.from - b.from);
    return Decoration.set(ranges, true);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const host = ref<HTMLDivElement | null>(null);
const activeDiagnostic = ref<RuleDiagnostic | null>(null);
function syncLineNumberTitles(editor: EditorView) {
  const byLine = new Map<number, string[]>();
  for (const item of editor.state.field(ruleDiagnosticsField)) byLine.set(item.line, [...(byLine.get(item.line) ?? []), item.message]);
  editor.dom.querySelectorAll<HTMLElement>(".cm-lineNumbers .cm-gutterElement").forEach((element) => {
    const lineNumber = Number(element.textContent?.trim());
    const messages = byLine.get(lineNumber);
    if (messages?.length) { element.title = messages.join("\n"); element.dataset.ruleDiagnosticLine = String(lineNumber); }
    else { element.removeAttribute("title"); delete element.dataset.ruleDiagnosticLine; }
  });
}
function handleEditorGutterClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-rule-diagnostic-line]") : null;
  if (!target) return;
  const line = Number(target.dataset.ruleDiagnosticLine);
  const diagnostic = props.diagnostics.find((item) => item.line === line);
  if (diagnostic) activeDiagnostic.value = diagnostic;
}
let view: EditorView | null = null;
let themeObs: MutationObserver | null = null;

let jumpHighlightTimer: number | null = null;
function jumpToLine(lineNumber: number) {
  if (!view || lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const editor = view;
  const line = editor.state.doc.line(lineNumber);
  const scroller = editor.scrollDOM;
  const block = editor.lineBlockAt(line.from);
  const viewportTop = scroller.scrollTop;
  const viewportBottom = viewportTop + scroller.clientHeight;
  // 只要目标行有任意部分可见，就不滚动；完全位于视口外才调整内部滚动条。
  const lineVisible = block.bottom > viewportTop && block.top < viewportBottom;

  if (jumpHighlightTimer !== null) window.clearTimeout(jumpHighlightTimer);

  // 仅当目标行不可见时修改 CodeMirror 自身的 scrollTop，绝不触发页面/祖先容器滚动。
  if (!lineVisible) {
    const lineHeight = Math.max(1, block.height);
    const targetOffset = Math.max(0, (scroller.clientHeight - lineHeight) / 2);
    scroller.scrollTop = Math.max(0, block.top - targetOffset);
  }

  // 只更新选区与高亮，不使用 scrollIntoView，也不主动 focus，避免浏览器滚动外层页面。
  editor.dispatch({
    selection: { anchor: line.to },
    effects: setJumpHighlight.of({ line: lineNumber, token: (editor.state.field(jumpHighlightField)?.token ?? 0) + 1 }),
  });
  // 保留行末光标，便于立即编辑；preventScroll 禁止浏览器为聚焦而滚动页面。
  editor.contentDOM.focus({ preventScroll: true });

  jumpHighlightTimer = window.setTimeout(() => {
    if (view) view.dispatch({ effects: setJumpHighlight.of(null) });
    jumpHighlightTimer = null;
  }, 1500);
}

function isDark(): boolean {
  return document.documentElement.classList.contains("theme-dark");
}

function buildExtensions(dark: boolean) {
  const h = props.height;
  const base = [
    lineNumbers(),
    highlightActiveLine(),
    ruleDiagnosticsField,
    jumpHighlightField,
    ruleDecorationField,
    gutter({ class: "cm-rule-diagnostic-gutter", markers(view) {
      const grouped = new Map<number, RuleDiagnostic>();
      for (const item of view.state.field(ruleDiagnosticsField)) {
        const old = grouped.get(item.line);
        if (!old || (old.severity !== "error" && item.severity === "error") || (old.severity === "info" && item.severity === "warning")) grouped.set(item.line, item);
      }
      const builder = new RangeSetBuilder<GutterMarker>();
      for (const [lineNumber, item] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
        if (lineNumber <= view.state.doc.lines) { const pos = view.state.doc.line(lineNumber).from; builder.add(pos, pos, new RuleDiagnosticMarker(item)); }
      }
      return builder.finish();
    } }),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) emit("update:modelValue", u.state.doc.toString());
      if (u.docChanged || u.viewportChanged || u.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setRuleDiagnostics)))) syncLineNumberTitles(u.view);
    }),
    EditorView.theme({
      "&": {
        height: `${h}px`,
        maxHeight: `${h}px`,
        fontSize: "13px",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily:
          'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
        lineHeight: "1.65",
      },
      ".cm-content": {
        padding: "12px 8px",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-rule-diagnostic-gutter": { width: "16px", background: "var(--surface-2)" },
      ".cm-rule-diagnostic-marker": { display: "inline-flex", width: "14px", height: "14px", marginLeft: "1px", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: "10px", fontWeight: "800", cursor: "help" },
      ".cm-rule-diagnostic-marker.is-error": { color: "var(--red)", background: "var(--red-soft)" },
      ".cm-rule-diagnostic-marker.is-warning": { color: "var(--warn)", background: "var(--warn-soft)" },
      ".cm-rule-diagnostic-marker.is-info": { color: "var(--accent)", background: "var(--accent-soft)" },
      ".cm-line.cm-rule-line-error": { background: "color-mix(in srgb, var(--red) 10%, transparent)" },
      ".cm-line.cm-rule-line-warning": { background: "color-mix(in srgb, var(--warn) 10%, transparent)" },
      ".cm-line.cm-rule-line-info": { background: "color-mix(in srgb, var(--accent) 7%, transparent)" },
      ".cm-line.cm-jump-highlight": { animation: "cm-rule-jump-flash 1.5s ease-out both", borderRadius: "3px" },
      "@keyframes cm-rule-jump-flash": {
        "0%": { backgroundColor: "color-mix(in srgb, #a78bfa 32%, transparent)" },
        "35%": { backgroundColor: "color-mix(in srgb, #a78bfa 22%, transparent)" },
        "100%": { backgroundColor: "transparent" },
      },
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
    effects: setRuleDiagnostics.of(props.diagnostics),
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
  if (jumpHighlightTimer !== null) window.clearTimeout(jumpHighlightTimer);
  jumpHighlightTimer = null;
  view?.destroy();
  view = null;
});

watch(() => props.diagnostics, (diagnostics) => {
  if (view) view.dispatch({ effects: setRuleDiagnostics.of(diagnostics) });
}, { deep: true });

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
  <div class="domain-editor">
    <div class="editor-shell" :class="{ 'is-invalid': invalid }" :style="{ height: height + 'px' }">
      <div ref="host" class="cm-host" @click="handleEditorGutterClick" />
      <div v-if="activeDiagnostic" class="inline-diagnostic-popover" role="status">
        <span class="inline-diagnostic-mark" :class="'is-' + activeDiagnostic.severity">{{ activeDiagnostic.severity === 'error' ? '×' : activeDiagnostic.severity === 'warning' ? '!' : 'i' }}</span>
        <div class="inline-diagnostic-copy"><strong>第 {{ activeDiagnostic.line }} 行</strong><span>{{ activeDiagnostic.message }}</span></div>
        <button type="button" class="inline-diagnostic-close" aria-label="关闭规则提示" @click="activeDiagnostic = null">×</button>
      </div>
      <div v-if="!modelValue && placeholder" class="ph">{{ placeholder }}</div>
    </div>
    <section v-if="diagnostics.length" class="rule-diagnostic-panel" aria-label="规则检查结果" aria-live="polite">
      <div class="rule-diagnostic-heading">
        <div class="rule-diagnostic-title">
          <span class="rule-diagnostic-title-icon" aria-hidden="true">!</span>
          <strong>规则检查</strong>
          <span class="rule-diagnostic-total">{{ diagnostics.length }} 条提示</span>
        </div>
        <div class="rule-diagnostic-summary">
          <span v-if="diagnostics.some(item => item.severity === 'error')" class="diagnostic-count is-error">{{ diagnostics.filter(item => item.severity === 'error').length }} 个错误</span>
          <span v-if="diagnostics.some(item => item.severity === 'warning')" class="diagnostic-count is-warning">{{ diagnostics.filter(item => item.severity === 'warning').length }} 个提醒</span>
          <span v-if="diagnostics.some(item => item.severity === 'info')" class="diagnostic-count is-info">{{ diagnostics.filter(item => item.severity === 'info').length }} 条建议</span>
        </div>
      </div>
      <div class="rule-diagnostic-list">
        <button
          v-for="(item, index) in diagnostics"
          :key="item.line + '-' + item.severity + '-' + item.message + '-' + index"
          type="button"
          class="rule-diagnostic-item"
          :class="'is-' + item.severity"
          :title="'定位到第 ' + item.line + ' 行'"
          @click="jumpToLine(item.line)"
        >
          <span class="rule-diagnostic-line">第 {{ item.line }} 行</span>
          <span class="rule-diagnostic-message">{{ item.message }}</span>
          <span class="rule-diagnostic-jump" aria-hidden="true">定位 ↗</span>
        </button>
      </div>
      <p class="rule-diagnostic-footer">点击任意提示可跳转到编辑器对应行；行号旁的标记也可查看问题。</p>
    </section>
  </div>
</template>

<style scoped>
.domain-editor { min-width: 0; }
.editor-shell {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg);
  overflow: hidden;
  /* 固定高度，不随内容增高 */
  flex-shrink: 0;
}
.editor-shell.is-invalid {
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}


.cm-host {
  height: 100%;
}

.cm-host :deep(.cm-editor) {
  height: 100%;
  background: transparent;
}

.cm-host :deep(.cm-scroller) {
  overflow: auto !important;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.cm-host :deep(.cm-scroller::-webkit-scrollbar) {
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
}

.cm-host :deep(.cm-scroller::-webkit-scrollbar-thumb) {
  background: var(--scrollbar-thumb);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.cm-host :deep(.cm-rule-diagnostic-gutter) { min-width: 16px; }
.cm-host :deep(.cm-lineNumbers .cm-gutterElement[data-rule-diagnostic-line]) { cursor: help; border-radius: 4px; }
.cm-host :deep(.cm-lineNumbers .cm-gutterElement[data-rule-diagnostic-line]:hover) { color: var(--accent); background: var(--accent-soft); }
.inline-diagnostic-popover { position: absolute; z-index: 5; right: 8px; bottom: 8px; display: flex; align-items: flex-start; gap: 8px; width: min(420px, calc(100% - 16px)); padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); box-shadow: 0 6px 24px rgba(0,0,0,.16); color: var(--text); }
.inline-diagnostic-mark { display: inline-grid; place-items: center; flex: 0 0 auto; width: 18px; height: 18px; border-radius: 50%; font-size: 12px; font-weight: 800; }
.inline-diagnostic-mark.is-error { color: var(--red); background: var(--red-soft); }
.inline-diagnostic-mark.is-warning { color: var(--warn); background: var(--warn-soft); }
.inline-diagnostic-mark.is-info { color: var(--accent); background: var(--accent-soft); }
.inline-diagnostic-copy { display: grid; gap: 3px; min-width: 0; font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.inline-diagnostic-copy strong { font-size: 10px; color: var(--muted); }
.inline-diagnostic-close { flex: 0 0 auto; border: 0; padding: 0 2px; background: transparent; color: var(--muted); font: inherit; font-size: 18px; line-height: 1; cursor: pointer; }
.cm-host :deep(.cm-scroller::-webkit-scrollbar-thumb:hover) {
  background: var(--scrollbar-thumb-hover);
}


.cm-host :deep(.cm-gutters) {
  background: var(--surface-2);
  border-right: 1px solid var(--line);
  color: var(--muted);
}

.rule-diagnostic-panel { margin-top: 8px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md, 10px); background: var(--surface); }
.rule-diagnostic-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.rule-diagnostic-title, .rule-diagnostic-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; min-width: 0; }
.rule-diagnostic-title { color: var(--text); font-size: 12px; }
.rule-diagnostic-title-icon { display: inline-grid; width: 18px; height: 18px; place-items: center; border-radius: 6px; background: var(--warn-soft); color: var(--warn); font-size: 12px; font-weight: 800; }
.rule-diagnostic-total { color: var(--muted); font-size: 11px; font-weight: 500; }
.diagnostic-count { padding: 3px 7px; border-radius: 999px; font-size: 10px; line-height: 1.2; white-space: nowrap; }
.diagnostic-count.is-error { color: var(--red); background: var(--red-soft); }
.diagnostic-count.is-warning { color: var(--warn); background: var(--warn-soft); }
.diagnostic-count.is-info { color: var(--accent); background: var(--accent-soft); }
.rule-diagnostic-list { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow: auto; padding: 6px; overscroll-behavior: contain; }
.rule-diagnostic-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 8px; width: 100%; padding: 7px 7px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--text); font: inherit; font-size: 12px; line-height: 1.5; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.rule-diagnostic-item:hover, .rule-diagnostic-item:focus-visible { border-color: var(--line); background: var(--surface-2); }
.rule-diagnostic-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.rule-diagnostic-line { display: inline-flex; align-items: center; justify-content: center; min-height: 22px; padding: 2px 7px; border-radius: 5px; background: var(--surface-2); color: var(--muted); font-size: 10px; font-weight: 750; white-space: nowrap; }
.rule-diagnostic-item.is-error .rule-diagnostic-line { color: var(--red); background: var(--red-soft); }
.rule-diagnostic-item.is-warning .rule-diagnostic-line { color: var(--warn); background: var(--warn-soft); }
.rule-diagnostic-item.is-info .rule-diagnostic-line { color: var(--accent); background: var(--accent-soft); }
.rule-diagnostic-message { min-width: 0; }
.rule-diagnostic-item.is-error .rule-diagnostic-message { color: var(--red); }
.rule-diagnostic-item.is-warning .rule-diagnostic-message { color: var(--warn); }
.rule-diagnostic-item.is-info .rule-diagnostic-message { color: var(--text); }
.rule-diagnostic-jump { align-self: center; color: var(--muted); font-size: 10px; white-space: nowrap; }
.rule-diagnostic-footer { margin: 0; padding: 8px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.45; }
@media (max-width: 600px) {
  .rule-diagnostic-heading { align-items: flex-start; flex-direction: column; padding: 9px 10px; }
  .rule-diagnostic-summary { gap: 5px; }
  .rule-diagnostic-list { max-height: 160px; padding: 4px; }
  .inline-diagnostic-popover { right: 5px; bottom: 5px; width: calc(100% - 10px); padding: 8px; }
  .rule-diagnostic-item { grid-template-columns: auto minmax(0, 1fr); gap: 6px; padding: 7px 6px; font-size: 11px; }
  .rule-diagnostic-line { grid-row: 1; grid-column: 1; }
  .rule-diagnostic-message { grid-row: 1; grid-column: 2; }
  .rule-diagnostic-jump { grid-row: 2; grid-column: 2; justify-self: start; padding-top: 2px; }
  .rule-diagnostic-footer { padding: 6px 9px; font-size: 10px; }
  .rule-diagnostic-jump { display: none; }
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
