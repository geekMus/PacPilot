<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { EditorView, highlightActiveLine, Decoration } from "@codemirror/view";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import type { RuleDiagnostic } from "@/utils/domain-rules";
import AppScrollArea from "@/components/AppScrollArea.vue";
import CodeMirrorField from "@/components/CodeMirrorField.vue";
const { t } = useI18n();

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
      const pos = transaction.changes.mapPos(
        transaction.startState.doc.line(Math.min(value.line, transaction.startState.doc.lines)).from
      );
      value = {
        ...value,
        line: transaction.state.doc.lineAt(Math.min(pos, transaction.state.doc.length)).number,
      };
    }
    return value;
  },
});
const ruleDiagnosticsField = StateField.define<RuleDiagnostic[]>({
  create: () => props.diagnostics,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setRuleDiagnostics)) value = effect.value;
    return value;
  },
});
const ruleDecorationField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    const diagnosticsChanged = transaction.effects.some((effect) => effect.is(setRuleDiagnostics));
    const highlightChanged = transaction.effects.some((effect) => effect.is(setJumpHighlight));
    if (
      !transaction.docChanged &&
      !diagnosticsChanged &&
      !highlightChanged &&
      (transaction.selection?.eq(transaction.startState.selection) ?? true)
    )
      return decorations.map(transaction.changes);
    const diagnostics = transaction.state.field(ruleDiagnosticsField);
    const byLine = new Map<number, RuleDiagnostic[]>();
    for (const diagnostic of diagnostics)
      byLine.set(diagnostic.line, [...(byLine.get(diagnostic.line) ?? []), diagnostic]);
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
        const severity = items.some((item) => item.severity === "error")
          ? "error"
          : items.some((item) => item.severity === "warning")
            ? "warning"
            : "info";
        classes.push("cm-rule-line-" + severity);
      }
      const targetColor = items.some((item) => item.severity === "error")
        ? "var(--red)"
        : items.some((item) => item.severity === "warning")
          ? "var(--warn)"
          : items.length
            ? "var(--accent)"
            : "transparent";
      const targetStrength =
        items.some((item) => item.severity === "info") &&
        !items.some((item) => item.severity !== "info")
          ? "7%"
          : items.length
            ? "10%"
            : "0%";
      if (highlightLine === lineNumber)
        classes.push(
          (highlight?.token ?? 0) % 2 === 0 ? "cm-jump-highlight-a" : "cm-jump-highlight-b"
        );
      ranges.push(
        Decoration.line({
          attributes: {
            class: classes.join(" "),
            style:
              "--cm-jump-target: " + targetColor + "; --cm-jump-strength: " + targetStrength + ";",
          },
        }).range(transaction.state.doc.line(lineNumber).from)
      );
    }
    ranges.sort((a, b) => a.from - b.from);
    return Decoration.set(ranges, true);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editorField = ref<InstanceType<typeof CodeMirrorField> | null>(null);

let jumpHighlightTimer: number | null = null;
function handleDiagnosticClick(event: MouseEvent, lineNumber: number) {
  jumpToLine(lineNumber);

  // 鼠标/触屏点击只需要瞬时按压反馈，不应把行按钮留在焦点高亮状态；
  // 键盘触发的 click detail 为 0，保留键盘可见焦点。
  if (event.detail > 0) (event.currentTarget as HTMLButtonElement | null)?.blur();
}

function jumpToLine(lineNumber: number) {
  const editor = editorField.value?.getEditorView();
  if (!editor || lineNumber < 1 || lineNumber > editor.state.doc.lines) return;
  const line = editor.state.doc.line(lineNumber);
  // CodeMirror 的内部 scroller 被限制为 overflow:hidden；真正可滚动的是外层 AppScrollArea 视口。
  const scroller =
    editor.dom.closest(".cm-field-scroll-viewport") instanceof HTMLElement
      ? (editor.dom.closest(".cm-field-scroll-viewport") as HTMLElement)
      : editor.scrollDOM;
  if (jumpHighlightTimer !== null) window.clearTimeout(jumpHighlightTimer);

  editor.dispatch({
    selection: { anchor: line.to },
    effects: setJumpHighlight.of({
      line: lineNumber,
      token: (editor.state.field(jumpHighlightField)?.token ?? 0) + 1,
    }),
  });
  editor.contentDOM.focus({ preventScroll: true });

  const ensureLineVisible = () => {
    if (editorField.value?.getEditorView() !== editor || lineNumber > editor.state.doc.lines)
      return;
    const line = editor.state.doc.line(lineNumber);
    const coords = editor.coordsAtPos(line.from);
    if (!coords) return;
    const viewportRect = scroller.getBoundingClientRect();
    const viewportTop = viewportRect.top + scroller.clientTop;
    const viewportBottom = viewportTop + scroller.clientHeight;
    const lineHeight = Math.max(1, coords.bottom - coords.top);
    if (coords.top < viewportTop || coords.bottom > viewportBottom) {
      // 使用实际滚动视口的坐标差调整 scrollTop，避免依赖被禁用滚动的 CodeMirror 内部 scroller。
      const lineTopInViewport = coords.top - viewportTop + scroller.scrollTop;
      scroller.scrollTop =
        lineTopInViewport - Math.max(0, (scroller.clientHeight - lineHeight) / 2);
    }
  };
  // 兼容移动端触摸、软键盘及容器重排后的布局变化。
  requestAnimationFrame(() => {
    ensureLineVisible();
    requestAnimationFrame(ensureLineVisible);
  });
  jumpHighlightTimer = window.setTimeout(() => {
    const currentEditor = editorField.value?.getEditorView();
    if (currentEditor) currentEditor.dispatch({ effects: setJumpHighlight.of(null) });
    jumpHighlightTimer = null;
  }, 1500);
}

function isDark(): boolean {
  return document.documentElement.classList.contains("theme-dark");
}

function buildExtensions(): Extension[] {
  const h = props.height;
  const base: Extension[] = [
    highlightActiveLine(),
    ruleDiagnosticsField,
    jumpHighlightField,
    ruleDecorationField,
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

    EditorView.theme({
      "&": {
        height: `${Math.max(0, h - 2)}px`,
        maxHeight: `${Math.max(0, h - 2)}px`,
        fontSize: "13px",
      },
      ".cm-scroller": {
        overflow: "hidden",
        fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, monospace',
        lineHeight: "1.65",
      },
      ".cm-content": {
        padding: "12px 8px",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-rule-diagnostic-gutter": { width: "16px", background: "var(--surface-2)" },
      ".cm-line.cm-rule-line-error": {
        background: "color-mix(in srgb, var(--red) 10%, transparent)",
      },
      ".cm-line.cm-rule-line-warning": {
        background: "color-mix(in srgb, var(--warn) 10%, transparent)",
      },
      ".cm-line.cm-rule-line-info": {
        background: "color-mix(in srgb, var(--accent) 7%, transparent)",
      },
      ".cm-line.cm-jump-highlight-a": {
        animation: "cm-rule-jump-flash-a 1.5s ease-out both",
        borderRadius: "3px",
      },
      ".cm-line.cm-jump-highlight-b": {
        animation: "cm-rule-jump-flash-b 1.5s ease-out both",
        borderRadius: "3px",
      },
      "@keyframes cm-rule-jump-flash-a": {
        "0%": { backgroundColor: "color-mix(in srgb, #a78bfa 38%, transparent)" },
        "40%": {
          backgroundColor:
            "color-mix(in srgb, #a78bfa 25%, var(--cm-jump-target) var(--cm-jump-strength, 0%))",
        },
        "100%": {
          backgroundColor:
            "color-mix(in srgb, var(--cm-jump-target) var(--cm-jump-strength, 0%), transparent)",
        },
      },
      "@keyframes cm-rule-jump-flash-b": {
        "0%": { backgroundColor: "color-mix(in srgb, #a78bfa 38%, transparent)" },
        "40%": {
          backgroundColor:
            "color-mix(in srgb, #a78bfa 25%, var(--cm-jump-target) var(--cm-jump-strength, 0%))",
        },
        "100%": {
          backgroundColor:
            "color-mix(in srgb, var(--cm-jump-target) var(--cm-jump-strength, 0%), transparent)",
        },
      },
    }),
  ];
  return base;
}

const editorExtensions = computed(() => buildExtensions());

onMounted(() => {
  const editor = editorField.value?.getEditorView();
  if (editor) editor.dispatch({ effects: setRuleDiagnostics.of(props.diagnostics) });
});

onBeforeUnmount(() => {
  if (jumpHighlightTimer !== null) window.clearTimeout(jumpHighlightTimer);
  jumpHighlightTimer = null;
});

watch(
  () => props.diagnostics,
  (diagnostics) => {
    const editor = editorField.value?.getEditorView();
    if (editor) editor.dispatch({ effects: setRuleDiagnostics.of(diagnostics) });
  },
  { deep: true }
);
</script>

<template>
  <div class="domain-editor">
    <CodeMirrorField
      ref="editorField"
      :model-value="props.modelValue"
      :placeholder="props.placeholder"
      :height="props.height"
      :invalid="props.invalid"
      theme="one-dark"
      :extensions="editorExtensions"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <section
      v-if="diagnostics.length"
      class="rule-diagnostic-panel"
      :aria-label="t('domainList.checkResult')"
      aria-live="polite"
    >
      <div class="rule-diagnostic-heading">
        <div class="rule-diagnostic-title">
          <span class="rule-diagnostic-title-icon" aria-hidden="true">!</span>
          <strong>{{ t("domainList.ruleCheck") }}</strong>
          <span class="rule-diagnostic-total">{{
            t("domainList.tipsCount", { n: diagnostics.length })
          }}</span>
        </div>
        <div class="rule-diagnostic-summary">
          <span
            v-if="diagnostics.some((item) => item.severity === 'error')"
            class="diagnostic-count is-error"
            >{{
              t("domainList.errorsCount", {
                n: diagnostics.filter((item) => item.severity === "error").length,
              })
            }}</span
          >
          <span
            v-if="diagnostics.some((item) => item.severity === 'warning')"
            class="diagnostic-count is-warning"
            >{{
              t("domainList.warningsCount", {
                n: diagnostics.filter((item) => item.severity === "warning").length,
              })
            }}</span
          >
          <span
            v-if="diagnostics.some((item) => item.severity === 'info')"
            class="diagnostic-count is-info"
            >{{
              t("domainList.infosCount", {
                n: diagnostics.filter((item) => item.severity === "info").length,
              })
            }}</span
          >
        </div>
      </div>
      <AppScrollArea
        root-class="rule-diagnostic-list"
        viewport-class="rule-diagnostic-viewport"
        orientation="vertical"
      >
        <button
          v-for="(item, index) in diagnostics"
          :key="item.line + '-' + item.severity + '-' + item.message + '-' + index"
          type="button"
          class="rule-diagnostic-item"
          :class="'is-' + item.severity"
          :title="t('domainList.jumpToLine', { line: item.line })"
          @click="handleDiagnosticClick($event, item.line)"
        >
          <span class="rule-diagnostic-line">{{ t("domainList.lineN", { line: item.line }) }}</span>
          <span class="rule-diagnostic-message">{{ item.message }}</span>
          <span class="rule-diagnostic-jump" aria-hidden="true">{{ t("domainList.locate") }}</span>
        </button>
      </AppScrollArea>
      <p class="rule-diagnostic-footer">{{ t("domainList.clickToJump") }}</p>
    </section>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.domain-editor {
  @apply min-w-0;
}
.rule-diagnostic-panel {
  @apply mt-2 overflow-hidden rounded-[var(--radius-md,10px)] border;
  border-color: var(--line);
  background: var(--surface);
}
.rule-diagnostic-heading {
  @apply flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-2.5 py-2;
  border-color: var(--line);
  background: var(--surface-2);
}
.rule-diagnostic-title,
.rule-diagnostic-summary {
  @apply flex min-w-0 flex-wrap items-center gap-[7px];
}
.rule-diagnostic-title {
  @apply text-xs;
  color: var(--text);
}
.rule-diagnostic-title-icon {
  @apply inline-grid h-[18px] w-[18px] place-items-center rounded-md text-xs font-extrabold;
  background: var(--warn-soft);
  color: var(--warn);
}
.rule-diagnostic-total {
  @apply text-[11px] font-medium;
  color: var(--muted);
}
.diagnostic-count {
  @apply whitespace-nowrap rounded-full px-[7px] py-[3px] text-[10px] leading-tight;
}
.diagnostic-count.is-error {
  color: var(--red);
  background: var(--red-soft);
}
.diagnostic-count.is-warning {
  color: var(--warn);
  background: var(--warn-soft);
}
.diagnostic-count.is-info {
  color: var(--accent);
  background: var(--accent-soft);
}
.rule-diagnostic-list {
  @apply flex flex-col gap-px p-0;
  height: fit-content;
  max-height: 220px;
  overscroll-behavior: contain;
}
.rule-diagnostic-list :deep(.rule-diagnostic-viewport) {
  @apply p-1;
}
.rule-diagnostic-item {
  @apply grid w-full cursor-pointer items-start gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-[5px] text-left text-xs leading-snug transition-colors;
  grid-template-columns: auto minmax(0, 1fr) auto;
  color: var(--text);
  overflow-wrap: anywhere;
  -webkit-tap-highlight-color: transparent;
}
.rule-diagnostic-item:focus-visible {
  border-color: var(--line);
  background: var(--surface-2);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
/* 仅在真正支持鼠标悬停的设备上显示 hover，避免触屏点击后 hover 状态残留。 */
@media (hover: hover) and (pointer: fine) {
  .rule-diagnostic-item:hover {
    border-color: var(--line);
    background: var(--surface-2);
  }
}
/* 触屏上点击结束后不保留焦点外观；按压期间仍由 :active 提供即时反馈。 */
@media (hover: none), (pointer: coarse) {
  .rule-diagnostic-item:focus:not(:focus-visible) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
  .rule-diagnostic-item:active {
    border-color: var(--line);
    background: var(--accent-soft);
  }
}
.rule-diagnostic-line {
  @apply inline-flex min-h-[22px] items-center justify-center whitespace-nowrap rounded-[5px] px-[7px] py-0.5 text-[10px] font-bold;
  background: var(--surface-2);
  color: var(--muted);
}
.rule-diagnostic-item.is-error .rule-diagnostic-line {
  color: var(--red);
  background: var(--red-soft);
}
.rule-diagnostic-item.is-warning .rule-diagnostic-line {
  color: var(--warn);
  background: var(--warn-soft);
}
.rule-diagnostic-item.is-info .rule-diagnostic-line {
  color: var(--accent);
  background: var(--accent-soft);
}
.rule-diagnostic-message {
  @apply min-w-0;
}
.rule-diagnostic-item.is-error .rule-diagnostic-message {
  color: var(--red);
}
.rule-diagnostic-item.is-warning .rule-diagnostic-message {
  color: var(--warn);
}
.rule-diagnostic-item.is-info .rule-diagnostic-message {
  color: var(--text);
}
.rule-diagnostic-jump {
  @apply self-center whitespace-nowrap text-[10px];
  color: var(--muted);
}
.rule-diagnostic-footer {
  @apply m-0 border-t px-3 py-2 text-[11px] leading-snug;
  border-color: var(--line);
  color: var(--muted);
}
@media (max-width: 600px) {
  .rule-diagnostic-panel {
    @apply mt-[5px] rounded-lg;
  }
  .rule-diagnostic-heading {
    @apply flex-row items-start gap-x-2 gap-y-[5px] px-2 py-1.5;
  }
  .rule-diagnostic-title,
  .rule-diagnostic-summary {
    @apply gap-[5px];
  }
  .rule-diagnostic-title {
    @apply text-[11px];
  }
  .rule-diagnostic-title-icon {
    @apply h-[15px] w-[15px] rounded-[4px] text-[10px];
  }
  .rule-diagnostic-total {
    @apply text-[10px];
  }
  .diagnostic-count {
    @apply px-[5px] py-0.5 text-[9px];
  }
  .rule-diagnostic-list {
    max-height: 150px;
  }
  .rule-diagnostic-list :deep(.rule-diagnostic-viewport) {
    @apply p-[3px];
  }
  .rule-diagnostic-item {
    @apply gap-[5px] rounded-[5px] px-[5px] py-1 text-[11px] leading-tight;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .rule-diagnostic-item:active {
    border-color: var(--line);
    background: var(--accent-soft);
  }
  .rule-diagnostic-line {
    @apply min-h-[18px] rounded-[4px] px-[5px] py-px text-[9px];
  }
  .rule-diagnostic-message,
  .rule-diagnostic-jump {
    @apply col-auto row-auto;
  }
  .rule-diagnostic-jump {
    @apply self-center pt-0 text-[9px];
  }
  .rule-diagnostic-footer {
    @apply px-2 py-[5px] text-[10px] leading-tight;
  }
}
.ph {
  @apply pointer-events-none absolute left-12 top-3 whitespace-pre-line font-mono text-[13px];
  z-index: 2;
  color: var(--muted);
  opacity: 0.75;
}
</style>
