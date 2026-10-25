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
          <button
            type="button"
            class="app-button app-button--sm app-button--secondary"
            :disabled="props.busy"
            @click="close"
          >
            {{ resolvedCancelText }}
          </button>
          <button
            type="button"
            class="app-button app-button--sm"
            :class="props.tone === 'warning' ? 'app-button--danger-ghost' : 'confirm-danger'"
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
        <div class="confirm-popover-arrow" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
@reference "@/styles/tailwind.css";

.confirm-anchor {
  @apply relative inline-flex max-w-full;
}
.confirm-popover {
  @apply relative z-[1200] box-border grid w-max gap-3.5 rounded-xl border p-[15px] outline-none;
  min-width: min(280px, calc(100vw - 24px));
  max-width: min(360px, calc(100vw - 24px));
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--dialog-panel-shadow, 0 12px 36px rgb(0 0 0 / 18%));
  transform-origin: var(--reka-popover-content-transform-origin);
}
.confirm-popover[data-state="open"] {
  animation: confirm-popover-in 120ms ease-out;
}
.confirm-popover-heading {
  @apply grid min-w-0 gap-1.5;
}
.confirm-popover-title {
  @apply m-0 text-sm font-bold leading-snug;
  color: var(--text);
}
.confirm-popover-description {
  @apply m-0 text-xs leading-normal;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.confirm-disabled-reason {
  @apply rounded-[9px] border px-2.5 py-[9px] text-xs leading-normal;
  border-color: var(--line);
  color: var(--muted);
  background: var(--surface-2);
}
.confirm-popover-actions {
  @apply flex flex-wrap justify-end gap-2;
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
  @apply absolute -top-[5px] right-5 h-2 w-2 rotate-45 border-l border-t;
  border-color: var(--line);
  background: var(--surface);
}
.confirm-popover[data-align="start"] .confirm-popover-arrow {
  @apply left-5 right-auto;
}
@keyframes confirm-popover-in {
  from {
    opacity: 0;
    transform: translateY(-3px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .confirm-popover[data-state="open"] {
    animation: none;
  }
}
</style>
