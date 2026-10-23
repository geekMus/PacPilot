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
        class="app-dialog-content"
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
.app-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: transparent;
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}
.app-dialog-content {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1001;
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 24px);
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--dialog-panel-shadow);
  transform: translate(-50%, -50%);
  outline: none;
}
.app-dialog-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  max-height: calc(100dvh - 24px);
  overflow: hidden;
  border-radius: inherit;
}
.app-dialog-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.app-dialog-heading {
  flex: 1 1 auto;
  min-width: 0;
}
.app-dialog-header-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.app-dialog-close {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: -4px -6px -4px 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
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
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.app-dialog-body .app-scroll-area-viewport {
  padding: 18px;
}
.app-dialog-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}
.app-dialog-footer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.app-dialog-footer button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.app-dialog-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 560px) {
  .app-dialog-content {
    max-width: calc(100vw - 16px);
  }
  .app-dialog-header {
    padding: 14px;
  }
  .app-dialog-body .app-scroll-area-viewport {
    padding: 14px;
  }
  .app-dialog-footer {
    padding: 12px 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-dialog-close {
    transition: none;
  }
}
</style>
