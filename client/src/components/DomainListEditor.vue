<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  Decoration,
} from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
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
const activeLine = ref(1);
const selectedDiagnosticKey = ref<string | null>(null);
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
    const lineNumbersToDecorate = new Set([...byLine.keys()]);
    if (highlightLine !== null) lineNumbersToDecorate.add(highlightLine);
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
      const targetStrength = items.some((item) => item.severity === "info") && !items.some((item) => item.severity !== "info") ? "7%" : items.length ? "10%" : "0%";
      if (highlightLine === lineNumber) classes.push((highlight?.token ?? 0) % 2 === 0 ? "cm-jump-highlight-a" : "cm-jump-highlight-b");
      ranges.push(Decoration.line({ attributes: { class: classes.join(" "), style: "--cm-jump-target: " + targetColor + "; --cm-jump-strength: " + targetStrength + ";" } }).range(transaction.state.doc.line(lineNumber).from));
    }
    ranges.sort((a, b) => a.from - b.from);
    return Decoration.set(ranges, true);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let themeObs: MutationObserver | null = null;

let jumpHighlightTimer: number | null = null;
function jumpToLine(lineNumber: number, diagnosticKey: string) {
  if (!view || lineNumber < 1 || lineNumber > view.state.doc.lines) return;
  const editor = view;
  const line = editor.state.doc.line(lineNumber);
  selectedDiagnosticKey.value = diagnosticKey;
  activeLine.value = lineNumber;
  const scroller = editor.scrollDOM;
  if (jumpHighlightTimer !== null) window.clearTimeout(jumpHighlightTimer);

  editor.dispatch({
    selection: { anchor: line.to },
    effects: setJumpHighlight.of({ line: lineNumber, token: (editor.state.field(jumpHighlightField)?.token ?? 0) + 1 }),
  });
  editor.contentDOM.focus({ preventScroll: true });

  const ensureLineVisible = () => {
    if (view !== editor || lineNumber > editor.state.doc.lines) return;
    const block = editor.lineBlockAt(editor.state.doc.line(lineNumber).from);
    const rect = scroller.getBoundingClientRect();
    const top = rect.top + scroller.clientTop;
    const bottom = top + scroller.clientHeight;
    const lineTop = top + block.top - scroller.scrollTop;
    const lineBottom = lineTop + Math.max(1, block.height);
    if (lineBottom <= top || lineTop >= bottom) {
      scroller.scrollTop = Math.max(0, block.top - Math.max(0, (scroller.clientHeight - block.height) / 2));
    }
  };
  // 兼容移动端触摸、软键盘及容器重排后的布局变化。
  requestAnimationFrame(() => {
    ensureLineVisible();
    requestAnimationFrame(ensureLineVisible);
  });
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
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.domEventHandlers({
      click(event, editor) {
        // 空白处点击或手机触摸时，显式将当前行同步到实际点击位置。
        const target = event.target;
        if (target instanceof Element && target.closest(".cm-gutters")) return false;
        const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        const clickedLine = editor.state.doc.lineAt(pos).number;
        const activeLine = editor.state.doc.lineAt(editor.state.selection.main.head).number;
        if (clickedLine !== activeLine) editor.dispatch({ selection: { anchor: pos } });
        return false;
      },
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) emit("update:modelValue", u.state.doc.toString());
      if (u.docChanged || u.selectionSet) {
        const line = u.state.doc.lineAt(u.state.selection.main.head).number;
        activeLine.value = line;
        if (selectedDiagnosticKey.value) {
          const selected = props.diagnostics.find((item, index) =>
            String(item.line) + "-" + item.severity + "-" + item.message + "-" + index === selectedDiagnosticKey.value
          );
          if (!selected || selected.line !== line) selectedDiagnosticKey.value = null;
        }
      }
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
      ".cm-line.cm-rule-line-error": { background: "color-mix(in srgb, var(--red) 10%, transparent)" },
      ".cm-line.cm-rule-line-warning": { background: "color-mix(in srgb, var(--warn) 10%, transparent)" },
      ".cm-line.cm-rule-line-info": { background: "color-mix(in srgb, var(--accent) 7%, transparent)" },
      ".cm-line.cm-jump-highlight-a": { animation: "cm-rule-jump-flash-a 1.5s ease-out both", borderRadius: "3px" },
      ".cm-line.cm-jump-highlight-b": { animation: "cm-rule-jump-flash-b 1.5s ease-out both", borderRadius: "3px" },
      "@keyframes cm-rule-jump-flash-a": {
        "0%": { backgroundColor: "color-mix(in srgb, #a78bfa 38%, transparent)" },
        "40%": { backgroundColor: "color-mix(in srgb, #a78bfa 25%, var(--cm-jump-target) var(--cm-jump-strength, 0%))" },
        "100%": { backgroundColor: "color-mix(in srgb, var(--cm-jump-target) var(--cm-jump-strength, 0%), transparent)" },
      },
      "@keyframes cm-rule-jump-flash-b": {
        "0%": { backgroundColor: "color-mix(in srgb, #a78bfa 38%, transparent)" },
        "40%": { backgroundColor: "color-mix(in srgb, #a78bfa 25%, var(--cm-jump-target) var(--cm-jump-strength, 0%))" },
        "100%": { backgroundColor: "color-mix(in srgb, var(--cm-jump-target) var(--cm-jump-strength, 0%), transparent)" },
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
      <div ref="host" class="cm-host" />
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
          :class="['is-' + item.severity, { 'is-active': selectedDiagnosticKey === String(item.line) + '-' + item.severity + '-' + item.message + '-' + index && activeLine === item.line }]"
          :title="'定位到第 ' + item.line + ' 行'"
          @click="jumpToLine(item.line, String(item.line) + '-' + item.severity + '-' + item.message + '-' + index)"
        >
          <span class="rule-diagnostic-line">第 {{ item.line }} 行</span>
          <span class="rule-diagnostic-message">{{ item.message }}</span>
          <span class="rule-diagnostic-jump" aria-hidden="true">定位 ↗</span>
        </button>
      </div>
      <p class="rule-diagnostic-footer">点击提示可跳转到对应行；选中项会随编辑器光标位置同步，切换到其他行后自动取消选中。</p>
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
.rule-diagnostic-item.is-active { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.rule-diagnostic-item.is-active .rule-diagnostic-line { color: var(--accent); background: var(--surface); }
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
  .rule-diagnostic-panel { margin-top: 5px; border-radius: 8px; }
  .rule-diagnostic-heading { align-items: flex-start; flex-direction: row; gap: 5px 8px; padding: 6px 8px; }
  .rule-diagnostic-title, .rule-diagnostic-summary { gap: 5px; }
  .rule-diagnostic-title { font-size: 11px; }
  .rule-diagnostic-title-icon { width: 15px; height: 15px; border-radius: 4px; font-size: 10px; }
  .rule-diagnostic-total { font-size: 10px; }
  .diagnostic-count { padding: 2px 5px; font-size: 9px; }
  .rule-diagnostic-list { max-height: 150px; gap: 1px; padding: 3px; }
  .rule-diagnostic-item { grid-template-columns: auto minmax(0, 1fr) auto; gap: 5px; padding: 4px 5px; border-radius: 5px; font-size: 11px; line-height: 1.35; }
  .rule-diagnostic-line { min-height: 18px; padding: 1px 5px; border-radius: 4px; font-size: 9px; }
  .rule-diagnostic-message { grid-row: auto; grid-column: auto; }
  .rule-diagnostic-jump { grid-row: auto; grid-column: auto; align-self: center; padding-top: 0; font-size: 9px; }
  .rule-diagnostic-footer { padding: 5px 8px; font-size: 10px; line-height: 1.35; }
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
