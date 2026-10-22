<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { DialogDescription, DialogTitle } from "reka-ui";
import AppDialog from "./AppDialog.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    busyText?: string;
    tone?: "danger" | "warning";
    align?: "start" | "end";
    disabled?: boolean;
    disabledReason?: string;
    busy?: boolean;
  }>(),
  {
    confirmText: "",
    cancelText: "",
    busyText: "",
    tone: "danger",
    align: "end",
    disabled: false,
    disabledReason: "",
    busy: false,
  }
);

const { t } = useI18n();
const resolvedConfirmText = computed(() => props.confirmText || t("common.confirm"));
const resolvedCancelText = computed(() => props.cancelText || t("common.back"));
const resolvedBusyText = computed(() => props.busyText || t("common.processing"));
const resolvedDisabledReason = computed(
  () => props.disabledReason || props.description || t("common.conditionNotMet")
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

function toggle() {
  if (props.disabled || props.busy) return;
  emit("update:open", !props.open);
}

function close() {
  if (!props.busy) emit("update:open", false);
}

function onOpenChange(open: boolean) {
  if (open) {
    if (!props.disabled && !props.busy) emit("update:open", true);
    return;
  }
  close();
}
</script>

<template>
  <div class="confirm-anchor" @click.stop>
    <slot name="trigger" :toggle="toggle" :open="props.open" />
  </div>
  <AppDialog
    :open="props.open"
    :label="props.title"
    content-class="confirm-dialog"
    @update:open="onOpenChange"
  >
    <section class="confirm-dialog" :class="'tone-' + props.tone">
      <header class="confirm-dialog-header">
        <DialogTitle class="confirm-dialog-title">{{ props.title }}</DialogTitle>
        <DialogDescription class="confirm-dialog-description">
          {{ props.description }}
        </DialogDescription>
      </header>
      <div v-if="props.disabled && props.disabledReason" class="confirm-disabled-reason">
        {{ resolvedDisabledReason }}
      </div>
      <div class="confirm-actions">
        <button
          type="button"
          class="confirm-cancel"
          :disabled="props.busy"
          :title="props.busy ? resolvedBusyText : resolvedCancelText"
          @click="close"
        >
          {{ resolvedCancelText }}
        </button>
        <button
          type="button"
          :class="props.tone === 'warning' ? 'confirm-warning' : 'confirm-danger'"
          :disabled="props.disabled || props.busy"
          :title="
            props.busy
              ? resolvedBusyText
              : props.disabled
                ? resolvedDisabledReason
                : resolvedConfirmText
          "
          @click="emit('confirm')"
        >
          {{ props.busy ? resolvedBusyText : resolvedConfirmText }}
        </button>
      </div>
    </section>
  </AppDialog>
</template>

<style>
.confirm-anchor {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.confirm-dialog {
  box-sizing: border-box;
  width: min(440px, calc(100vw - 24px));
  max-height: min(86dvh, 620px);
  overflow: auto;
  padding: 0;
  border-radius: 14px;
}
.confirm-dialog-header {
  display: grid;
  gap: 7px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.confirm-dialog-title {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 750;
  line-height: 1.4;
}
.confirm-dialog-description {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.confirm-disabled-reason {
  margin: 14px 18px 0;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--muted);
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.5;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 18px 18px;
}
.confirm-actions button {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.confirm-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.confirm-actions .confirm-danger {
  background: var(--red);
  border-color: var(--red);
  color: white;
}
.confirm-actions .confirm-warning {
  background: var(--amber-soft, #fff3dc);
  border-color: color-mix(in srgb, var(--amber, #d97706) 40%, var(--line));
  color: var(--amber, #b45309);
}
.confirm-actions .confirm-warning:hover:not(:disabled) {
  filter: brightness(0.98);
}
.confirm-actions .confirm-danger:hover:not(:disabled) {
  filter: brightness(0.96);
}
.confirm-cancel:focus-visible,
.confirm-danger:focus-visible,
.confirm-warning:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .confirm-dialog,
  .confirm-dialog-header {
    animation: none;
  }
}
</style>
