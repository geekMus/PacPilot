<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  gutter,
  GutterMarker,
  Decoration,
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
const ruleDiagnosticsField = StateField.define<RuleDiagnostic[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setRuleDiagnostics)) value = effect.value;
    return value;
  },
});
class RuleDiagnosticMarker extends GutterMarker {
  constructor(readonly diagnostic: RuleDiagnostic) { super(); }
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-rule-diagnostic-marker " + (this.diagnostic.severity === "error" ? "is-error" : this.diagnostic.severity === "warning" ? "is-warning" : "is-info");
    marker.textContent = this.diagnostic.severity === "error" ? "×" : this.diagnostic.severity === "warning" ? "!" : "i";
    marker.title = this.diagnostic.message;
    marker.setAttribute("aria-label", this.diagnostic.message);
    return marker;
  }
  eq(other: RuleDiagnosticMarker) {
    return this.diagnostic.line === other.diagnostic.line && this.diagnostic.message === other.diagnostic.message && this.diagnostic.severity === other.diagnostic.severity;
  }
}
const ruleDecorationField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    if (!transaction.docChanged && !transaction.effects.some((effect) => effect.is(setRuleDiagnostics))) return decorations.map(transaction.changes);
    const diagnostics = transaction.state.field(ruleDiagnosticsField);
    const byLine = new Map<number, RuleDiagnostic[]>();
    for (const diagnostic of diagnostics) byLine.set(diagnostic.line, [...(byLine.get(diagnostic.line) ?? []), diagnostic]);
    const ranges = [];
    for (const [lineNumber, items] of byLine) {
      if (lineNumber > transaction.state.doc.lines) continue;
      const line = transaction.state.doc.line(lineNumber);
      const severity = items.some((item) => item.severity === "error") ? "error" : items.some((item) => item.severity === "warning") ? "warning" : "info";
      ranges.push(Decoration.line({ attributes: { class: "cm-rule-line-" + severity, title: items.map((item) => item.message).join("\n") } }).range(line.from));
    }
    ranges.sort((a, b) => a.from - b.from);
    return Decoration.set(ranges, true);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let themeObs: MutationObserver | null = null;

function isDark(): boolean {
  return document.documentElement.classList.contains("theme-dark");
}

function buildExtensions(dark: boolean) {
  const h = props.height;
  const base = [
    lineNumbers(),
    highlightActiveLine(),
    ruleDiagnosticsField,
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
      if (u.docChanged) {
        emit("update:modelValue", u.state.doc.toString());
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
        lineHeight: "1.5",
      },
      ".cm-content": {
        padding: "10px 0",
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
  <div class="editor-shell" :class="{ 'is-invalid': invalid }" :style="{ height: height + 'px' }">
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
.cm-host :deep(.cm-scroller::-webkit-scrollbar-thumb:hover) {
  background: var(--scrollbar-thumb-hover);
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
