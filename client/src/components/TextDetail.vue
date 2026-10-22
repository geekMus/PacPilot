<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import AppDialog from "./AppDialog.vue";
import { useCopyFeedback } from "../composables/useCopyFeedback";
import { useI18n } from "vue-i18n";
import { computed, ref } from "vue";
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

const trigger = ref<HTMLButtonElement | null>(null);
const dialogOpen = ref(false);
const { copyState, copyWithFeedback, resetCopyState } = useCopyFeedback();
const fullText = computed(() => props.text ?? "");
const resolvedLabel = computed(() => props.label || t("common.recordDetail"));

function openDetails(): void {
  resetCopyState();
  dialogOpen.value = true;
}

function closeDetails(): void {
  dialogOpen.value = false;
}

function onDialogOpenChange(open: boolean): void {
  dialogOpen.value = open;
  if (!open) resetCopyState();
}

async function copyContent(): Promise<void> {
  const text = fullText.value || "—";
  await copyWithFeedback(text);
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

  <AppDialog
    :open="dialogOpen"
    content-class="text-detail-dialog"
    :label="t('common.detailAria', { label: resolvedLabel })"
    @update:open="onDialogOpenChange"
  >
    <div class="text-detail-dialog">
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
      <div class="text-detail-actions">
        <button
          class="text-detail-button secondary"
          :class="{ 'is-copy-success': copyState === 'success', 'is-copy-error': copyState === 'error' }"
          type="button"
          aria-live="polite"
          @click="copyContent"
        >
          <AppIcon
            :name="copyState === 'success' ? 'circle-check' : copyState === 'error' ? 'circle-x' : 'copy'"
            :size="14"
          />{{ copyState === 'success' ? t("common.copiedShort") : copyState === 'error' ? t("common.copyFailed") : t("common.copyContent") }}
        </button>
        <button class="text-detail-button primary" type="button" @click="closeDetails">
          {{ t("common.close") }}
        </button>
      </div>
    </footer>
    </div>
  </AppDialog>
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

.text-detail-button.is-copy-success {
  border-color: color-mix(in srgb, var(--green) 55%, var(--line));
  color: var(--green);
}

.text-detail-button.is-copy-error {
  border-color: color-mix(in srgb, var(--red, #dc2626) 55%, var(--line));
  color: var(--red, #dc2626);
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
