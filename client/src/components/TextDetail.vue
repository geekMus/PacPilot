<script setup lang="ts">
import AppIcon from "@/components/AppIcon.vue";
import AppDialog from "@/components/AppDialog.vue";
import { DialogTitle } from "reka-ui";
import { useCopyFeedback } from "@/composables/useCopyFeedback";
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
    :label="t('common.detailAria', { label: resolvedLabel })"
    width="min(680px, calc(100vw - 20px))"
    :close-label="t('common.closeDetail')"
    @update:open="onDialogOpenChange"
  >
    <template #header>
      <div class="text-detail-heading">
        <p>{{ resolvedLabel }}</p>
        <DialogTitle class="text-detail-title">{{ t("common.recordDetail") }}</DialogTitle>
      </div>
    </template>
    <template #body>
      <pre class="text-detail-content">{{ fullText || "—" }}</pre>
    </template>
    <template #footer>
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
    </template>
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
.text-detail-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
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
.text-detail-title {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.02em;
}
.text-detail-content {
  margin: 0;
  padding: 14px;
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
.text-detail-button.is-copy-success {
  border-color: color-mix(in srgb, var(--green) 55%, var(--line));
  color: var(--green);
}
.text-detail-button.is-copy-error {
  border-color: color-mix(in srgb, var(--red, #dc2626) 55%, var(--line));
  color: var(--red, #dc2626);
}
@media (max-width: 560px) {
  .text-detail-content {
    padding: 12px;
  }
}
</style>