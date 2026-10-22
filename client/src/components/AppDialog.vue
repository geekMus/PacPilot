<script setup lang="ts">
import { ref, watch } from "vue";
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from "reka-ui";

const props = defineProps<{
  open: boolean;
  label: string;
  contentClass: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const previouslyFocused = ref<HTMLElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (open && typeof document !== "undefined") {
      previouslyFocused.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
  }
);

function onCloseAutoFocus(event: Event): void {
  event.preventDefault();
  const target = previouslyFocused.value;
  previouslyFocused.value = null;
  if (target?.isConnected) target.focus();
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="app-dialog-overlay" :class="props.contentClass + '-overlay'" />
      <DialogContent
        as-child
        class="app-dialog-content"
        :aria-label="props.label"
        @close-auto-focus="onCloseAutoFocus"
      >
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.app-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--dialog-overlay-bg);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}
.app-dialog-content {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1001;
  max-width: calc(100vw - 16px);
  transform: translate(-50%, -50%);
  outline: none;
}
@media (prefers-reduced-motion: reduce) {
  .app-dialog-overlay {
    animation: none;
  }
}
</style>
