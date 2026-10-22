<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { DialogDescription, DialogTitle } from "reka-ui";
import AppDialog from "@/components/AppDialog.vue";

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
    :close-label="resolvedCancelText"
    content-class="confirm-dialog"
    @update:open="onOpenChange"
  >
    <template #header>
      <div class="confirm-dialog-heading">
        <DialogTitle class="confirm-dialog-title">{{ props.title }}</DialogTitle>
        <DialogDescription class="confirm-dialog-description">
          {{ props.description }}
        </DialogDescription>
      </div>
    </template>
    <template #body>
      <div v-if="props.disabled && props.disabledReason" class="confirm-disabled-reason">
        {{ resolvedDisabledReason }}
      </div>
    </template>
    <template #footer>
      <button type="button" class="confirm-cancel" :disabled="props.busy" @click="close">
        {{ resolvedCancelText }}
      </button>
      <button
        type="button"
        :class="props.tone === 'warning' ? 'confirm-warning' : 'confirm-danger'"
        :disabled="props.disabled || props.busy"
        :title="props.busy ? resolvedBusyText : props.disabled ? resolvedDisabledReason : resolvedConfirmText"
        @click="emit('confirm')"
      >
        {{ props.busy ? resolvedBusyText : resolvedConfirmText }}
      </button>
    </template>
  </AppDialog>
</template>

<style>
.confirm-anchor {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.app-dialog-content.confirm-dialog {
  width: min(440px, calc(100vw - 24px));
}
.confirm-dialog .app-dialog-header {
  padding-bottom: 14px;
}
.confirm-dialog-heading {
  display: grid;
  gap: 7px;
  min-width: 0;
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
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--muted);
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.5;
}
.confirm-dialog .confirm-danger {
  background: var(--red);
  border-color: var(--red);
  color: white;
}
.confirm-dialog .confirm-warning {
  background: var(--amber-soft, #fff3dc);
  border-color: color-mix(in srgb, var(--amber, #d97706) 40%, var(--line));
  color: var(--amber, #b45309);
}
.confirm-dialog .confirm-warning:hover:not(:disabled) {
  filter: brightness(0.98);
}
.confirm-dialog .confirm-danger:hover:not(:disabled) {
  filter: brightness(0.96);
}
.confirm-dialog .confirm-cancel:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.confirm-dialog .app-dialog-body:empty {
  display: none;
  padding: 0;
}
</style>
