<script setup lang="ts">
import { ref, watch } from "vue";
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from "reka-ui";
import AppIcon from "@/components/AppIcon.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    label: string;
    contentClass?: string;
    bodyClass?: string;
    width?: string;
    closeLabel?: string;
    showClose?: boolean;
  }>(),
  {
    contentClass: "",
    bodyClass: "",
    closeLabel: "Close dialog",
    showClose: true,
  }
);

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
      <DialogOverlay class="app-dialog-overlay" />
      <DialogContent
        as-child
        :aria-label="props.label"
        @close-auto-focus="onCloseAutoFocus"
      >
        <section class="app-dialog-shell" :class="props.contentClass" :style="props.width ? { width: props.width } : undefined">
          <header v-if="$slots.header || $slots['header-actions'] || props.showClose" class="app-dialog-header">
            <div class="app-dialog-heading">
              <slot name="header" />
            </div>
            <div v-if="$slots['header-actions'] || props.showClose" class="app-dialog-header-actions">
              <slot name="header-actions" />
              <button
                v-if="props.showClose"
                type="button"
                class="app-dialog-close"
                :aria-label="props.closeLabel"
                :title="props.closeLabel"
                @click="emit('update:open', false)"
              >
                <AppIcon name="x" :size="17" />
              </button>
            </div>
          </header>
          <AppScrollArea
            :root-class="['app-dialog-body', props.bodyClass].filter(Boolean).join(' ')"
            orientation="vertical"
            type="auto"
            overscroll="contain"
          >
            <slot name="body">
              <slot />
            </slot>
          </AppScrollArea>
          <footer v-if="$slots.footer" class="app-dialog-footer">
            <slot name="footer" />
          </footer>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
@reference "../styles/tailwind.css";

.app-dialog-overlay {
  @apply fixed inset-0 z-[1000];
  background: var(--dialog-overlay-bg);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}
.app-dialog-shell {
  @apply fixed top-1/2 left-1/2 z-[1001] grid w-max max-w-[calc(100vw-16px)] min-w-0 overflow-hidden rounded-[14px] border outline-none;
  grid-template-rows: auto minmax(0, 1fr) auto;
  box-sizing: border-box;
  height: fit-content;
  max-height: min(85dvh, 800px);
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--dialog-panel-shadow);
  transform: translate(-50%, -50%);
}
.app-dialog-header {
  @apply flex shrink-0 flex-wrap items-start justify-between gap-x-3 gap-y-2.5 min-w-0 px-[18px] py-4 border-b;
  border-color: var(--line);
  background: var(--surface);
}
.app-dialog-heading {
  @apply min-w-0 flex-[1_1_180px];
  overflow-wrap: anywhere;
}
.app-dialog-header-actions {
  @apply ml-auto inline-flex max-w-full min-w-0 flex-[0_1_auto] flex-wrap items-center justify-end gap-2;
}
.app-dialog-close {
  @apply inline-grid shrink-0 place-items-center w-8 h-8 p-0 rounded-lg border border-transparent bg-transparent transition-colors;
  margin: -4px -6px -4px 0;
  color: var(--muted);
  cursor: pointer;
}
.app-dialog-close:hover {
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--text);
}
.app-dialog-close:focus-visible,
.app-dialog-footer button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.app-dialog-body {
  @apply min-h-0 w-full min-w-0 overflow-hidden;
}
.app-dialog-body .app-scroll-area-viewport {
  @apply box-border h-full w-full min-w-0 min-h-0 overflow-x-hidden p-[18px];
  max-height: none;
  /* Chaining is blocked by the `overscroll="contain"` prop on the component
     so the page behind the modal never scrolls. */
}
.app-dialog-footer {
  @apply flex shrink-0 flex-wrap items-center justify-end gap-2 px-[18px] py-3.5 border-t;
  border-color: var(--line);
  background: var(--surface);
}
.app-dialog-footer button {
  @apply inline-flex items-center justify-center gap-[7px] min-h-9 px-[13px] rounded-lg border text-xs font-bold cursor-pointer;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--text);
}
.app-dialog-footer button:disabled {
  @apply opacity-55 cursor-not-allowed;
}
.app-dialog-visually-hidden {
  @apply absolute w-px h-px p-0 -m-px overflow-hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
