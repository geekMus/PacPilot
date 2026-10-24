<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from "reka-ui";

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
        :align="props.align"
        side="bottom"
        :side-offset="7"
        :collision-padding="10"
        @open-auto-focus.prevent
      >
        <div class="confirm-popover-heading">
          <h3 class="confirm-popover-title">{{ props.title }}</h3>
          <p class="confirm-popover-description">{{ props.description }}</p>
        </div>
        <div v-if="props.disabled && props.disabledReason" class="confirm-disabled-reason">
          {{ resolvedDisabledReason }}
        </div>
        <div class="confirm-popover-actions">
          <button type="button" class="app-button app-button--sm app-button--secondary" :disabled="props.busy" @click="close">
            {{ resolvedCancelText }}
          </button>
          <button
            type="button"
            class="app-button app-button--sm"
            :class="props.tone === 'warning' ? 'app-button--danger-ghost' : 'confirm-danger'"
            :disabled="props.disabled || props.busy"
            :title="props.busy ? resolvedBusyText : props.disabled ? resolvedDisabledReason : resolvedConfirmText"
            @click="emit('confirm')"
          >
            {{ props.busy ? resolvedBusyText : resolvedConfirmText }}
          </button>
        </div>
        <div class="confirm-popover-arrow" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
.confirm-anchor {
  position: relative;
  display: inline-flex;
  max-width: 100%;
}
.confirm-popover {
  position: relative;
  z-index: 1200;
  box-sizing: border-box;
  display: grid;
  width: max-content;
  min-width: min(280px, calc(100vw - 24px));
  max-width: min(360px, calc(100vw - 24px));
  gap: 14px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--dialog-panel-shadow, 0 12px 36px rgb(0 0 0 / 18%));
  outline: none;
  transform-origin: var(--reka-popover-content-transform-origin);
}
.confirm-popover[data-state="open"] {
  animation: confirm-popover-in 120ms ease-out;
}
.confirm-popover-heading {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.confirm-popover-title {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 750;
  line-height: 1.4;
}
.confirm-popover-description {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.confirm-disabled-reason {
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--muted);
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.5;
}
.confirm-popover-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
/* Buttons reuse the shared app-button system; only the danger tone needs the
   red surface, which the shared variant does not cover. */
.confirm-popover-actions .confirm-danger {
  border-color: var(--red);
  background: var(--red);
  color: var(--red-contrast);
}
.confirm-popover-actions .confirm-danger:hover:not(:disabled) {
  filter: brightness(0.96);
}
.confirm-popover-arrow {
  position: absolute;
  top: -5px;
  right: 20px;
  width: 8px;
  height: 8px;
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
  background: var(--surface);
  transform: rotate(45deg);
}
.confirm-popover[data-align="start"] .confirm-popover-arrow {
  right: auto;
  left: 20px;
}
@keyframes confirm-popover-in {
  from { opacity: 0; transform: translateY(-3px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .confirm-popover[data-state="open"] {
    animation: none;
  }
}
</style>
