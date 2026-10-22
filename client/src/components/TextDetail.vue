<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import { useI18n } from "vue-i18n";
import { computed, nextTick, ref } from "vue";
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    text?: string | null;
    label?: string;
  }>(),
  {
    text: "",
    label: "", // resolved via t() below when empty
  }
);

const dialog = ref<HTMLDialogElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const dialogMounted = ref(false);
const copyStateKey = ref<"common.copied" | "common.copyManual" | "">("");
const copyState = computed(() => (copyStateKey.value ? t(copyStateKey.value) : ""));
const fullText = computed(() => props.text ?? "");
const resolvedLabel = computed(() => props.label || t("common.recordDetail"));

async function openDetails(): Promise<void> {
  copyStateKey.value = "";
  dialogMounted.value = true;
  await nextTick();
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
}

function closeDetails(): void {
  if (dialog.value?.open) dialog.value.close();
}

function handleDialogClick(event: MouseEvent): void {
  if (event.target === dialog.value) closeDetails();
}

function restoreFocus(): void {
  trigger.value?.focus();
}

function onDialogClose(): void {
  restoreFocus();
  dialogMounted.value = false;
}

function copyWithLegacyCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.opacity = "0.01";

  // A modal <dialog> makes the rest of the document inert. Keep the temporary
  // textarea inside the open dialog so it can receive focus and be copied.
  const container = dialog.value?.open ? dialog.value : document.body;
  container.appendChild(textarea);

  let copied = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    // Do not report success if the browser refused to focus/select the text.
    if (
      document.activeElement === textarea &&
      textarea.selectionStart === 0 &&
      textarea.selectionEnd === text.length
    ) {
      copied = document.execCommand("copy");
    }
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
  return copied;
}

async function copyContent(): Promise<void> {
  const text = fullText.value || "—";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copyStateKey.value = "common.copied";
      return;
    }
  } catch {
    // Clipboard API is unavailable or blocked, for example on an insecure HTTP origin.
  }

  copyStateKey.value = copyWithLegacyCommand(text) ? "common.copied" : "common.copyManual";
}
</script>

<template>
  <button
    ref="trigger"
    class="text-detail-trigger"
    type="button"
    :title="t('common.viewDetail', { label: resolvedLabel })"
    :aria-label="t('common.viewDetailAria', { label: resolvedLabel })"
    @click="openDetails"
  >
    <slot>{{ fullText || "—" }}</slot>
  </button>

  <dialog
    v-if="dialogMounted"
    ref="dialog"
    class="text-detail-dialog"
    :aria-label="t('common.detailAria', { label: resolvedLabel })"
    @click="handleDialogClick"
    @close="onDialogClose"
  >
    <header class="text-detail-header">
      <div class="text-detail-heading">
        <p>{{ resolvedLabel }}</p>
        <h2>{{ t("common.recordDetail") }}</h2>
      </div>
      <button
        class="text-detail-close"
        type="button"
        :aria-label="t('common.closeDetail')"
        @click="closeDetails"
      >
        <AppIcon name="x" :size="16" />
      </button>
    </header>

    <pre class="text-detail-content">{{ fullText || "—" }}</pre>

    <footer class="text-detail-footer">
      <span class="text-detail-copy-state" role="status" aria-live="polite">{{ copyState }}</span>
      <div class="text-detail-actions">
        <button class="text-detail-button secondary" type="button" @click="copyContent">
          <AppIcon name="copy" :size="14" />{{ t("common.copyContent") }}
        </button>
        <button class="text-detail-button primary" type="button" @click="closeDetails">
          {{ t("common.close") }}
        </button>
      </div>
    </footer>
  </dialog>
</template>

<style scoped>
.text-detail-trigger {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: color-mix(in srgb, var(--muted) 52%, transparent);
  text-underline-offset: 3px;
  cursor: pointer;
}

.text-detail-trigger:hover,
.text-detail-trigger:focus-visible {
  color: var(--accent);
  text-decoration-color: currentColor;
}

.text-detail-trigger:focus-visible,
.text-detail-close:focus-visible,
.text-detail-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.text-detail-dialog {
  box-sizing: border-box;
  position: fixed;
  width: min(680px, calc(100vw - 28px));
  max-width: none;
  max-height: min(82dvh, 760px);
  margin: auto;
  padding: 20px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}

.text-detail-dialog::backdrop {
  background: rgb(0 0 0 / 52%);
  backdrop-filter: blur(2px);
}

.text-detail-header,
.text-detail-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.text-detail-heading {
  min-width: 0;
}

.text-detail-heading p {
  margin: 0 0 5px;
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.text-detail-heading h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.4;
}

.text-detail-close:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.text-detail-close:active {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast);
}
.text-detail-close {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: -4px -4px 0 0;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.text-detail-content {
  max-height: min(52dvh, 470px);
  margin: 18px 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  font:
    12px/1.7 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  user-select: text;
}

.text-detail-footer {
  align-items: center;
  flex-wrap: wrap;
}

.text-detail-copy-state {
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.text-detail-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.text-detail-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 9px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.text-detail-button.secondary {
  background: var(--surface-2);
  color: var(--text);
}

.text-detail-button.secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface);
}
.text-detail-button.secondary:active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.text-detail-button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast, #fff);
}
.text-detail-button.primary:hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
  color: var(--accent-contrast);
}
.text-detail-button.primary:active {
  border-color: var(--accent-active);
  background: var(--accent-active);
  color: var(--accent-contrast);
}

@media (max-width: 560px) {
  .text-detail-dialog {
    width: calc(100vw - 20px);
    max-height: 86dvh;
    padding: 16px;
    border-radius: 14px;
  }

  .text-detail-content {
    max-height: 56dvh;
    margin: 14px 0;
    padding: 12px;
  }

  .text-detail-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .text-detail-actions {
    width: 100%;
    margin-left: 0;
  }

  .text-detail-button {
    flex: 1;
  }
}
</style>
