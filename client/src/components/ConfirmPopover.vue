<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";

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
  <PopoverRoot :open="props.open" @update:open="onOpenChange">
    <PopoverAnchor as-child>
      <div class="confirm-anchor" @click.stop>
        <slot name="trigger" :toggle="toggle" :open="props.open" />
      </div>
    </PopoverAnchor>
    <PopoverPortal>
      <PopoverContent
        class="confirm-popover"
        :class="['tone-' + props.tone]"
        :align="props.align"
        side="bottom"
        :side-offset="6"
        :collision-padding="8"
        :aria-label="t('common.confirmAction')"
        @escape-key-down="close"
        @pointer-down-outside="close"
      >
        <strong>{{ props.title }}</strong>
        <span>{{ props.description }}</span>
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
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
.confirm-anchor {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
.confirm-popover {
  z-index: 40;
  width: 285px;
  box-sizing: border-box;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  text-align: left;
  transform-origin: var(--reka-popover-content-transform-origin);
  animation: confirm-popover-in 120ms ease-out;
}
.confirm-popover.tone-warning {
  border-color: color-mix(in srgb, var(--amber, #d97706) 35%, var(--line));
}
.confirm-popover strong,
.confirm-popover span {
  display: block;
}
.confirm-popover strong {
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
}
.confirm-popover span {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 12px;
}
.confirm-actions button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 11px;
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
@keyframes confirm-popover-in {
  from { opacity: 0; transform: translateY(-2px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .confirm-popover { animation: none; }
}
</style>
