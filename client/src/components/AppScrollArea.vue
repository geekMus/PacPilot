<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "reka-ui";

withDefaults(
  defineProps<{
    orientation?: "vertical" | "horizontal" | "both";
    type?: "auto" | "always" | "scroll" | "hover";
    rootClass?: string;
    viewportClass?: string;
    /**
     * Scroll chaining. "auto" (default) lets the outer container take over
     * once this area hits its own edge, which is what nested lists and
     * panels need. Blocking overlays (dialogs, sheets) must pass "contain"
     * so the page behind them never scrolls.
     */
    overscroll?: "auto" | "contain" | "none";
  }>(),
  {
    orientation: "vertical",
    type: "hover",
    rootClass: "",
    viewportClass: "",
    overscroll: "auto",
  }
);

const emit = defineEmits<{
  ready: [element: HTMLElement];
  scroll: [element: HTMLElement];
}>();

const root = ref<unknown>(null);

function getViewport(): HTMLElement | null {
  const value = root.value as { $el?: HTMLElement } | HTMLElement | null;
  const element = value instanceof HTMLElement ? value : value?.$el;
  return element?.querySelector<HTMLElement>(".app-scroll-area-viewport") ?? null;
}

onMounted(() => {
  const element = getViewport();
  if (element) emit("ready", element);
});

function onScroll(event: Event): void {
  const element = event.currentTarget;
  if (element instanceof HTMLElement) emit("scroll", element);
}
</script>

<template>
  <ScrollAreaRoot
    ref="root"
    class="app-scroll-area"
    :class="rootClass"
    :type="type"
    :scroll-hide-delay="500"
    :style="{ '--app-scroll-overscroll': overscroll }"
  >
    <template v-if="$slots.viewport">
      <slot
        name="viewport"
        :viewport-component="ScrollAreaViewport"
        :viewport-class="`app-scroll-area-viewport ${viewportClass}`"
        :on-scroll="onScroll"
      />
    </template>
    <ScrollAreaViewport
      v-else
      class="app-scroll-area-viewport"
      :class="viewportClass"
      @scroll.passive="onScroll"
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollAreaScrollbar
      v-if="orientation === 'vertical' || orientation === 'both'"
      class="app-scrollbar"
      orientation="vertical"
    >
      <ScrollAreaThumb class="app-scrollbar-thumb" />
    </ScrollAreaScrollbar>
    <ScrollAreaScrollbar
      v-if="orientation === 'horizontal' || orientation === 'both'"
      class="app-scrollbar"
      orientation="horizontal"
    >
      <ScrollAreaThumb class="app-scrollbar-thumb" />
    </ScrollAreaScrollbar>
    <ScrollAreaCorner v-if="orientation === 'both'" class="app-scrollbar-corner" />
  </ScrollAreaRoot>
</template>

<style>
@reference "@/styles/tailwind.css";

.app-scroll-area {
  @apply relative overflow-hidden min-w-0 min-h-0;
  --scrollbar-size: 8px;
}

.app-scroll-area-viewport {
  @apply w-full h-full;
  border-radius: inherit;
  /* Chaining is the default so a nested area can hand the wheel back to the
     page once it reaches its edge. Overlays override this via the
     `overscroll` prop. */
  overscroll-behavior: var(--app-scroll-overscroll, auto);
  -webkit-overflow-scrolling: touch;
}

.app-scroll-area-viewport:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.app-scrollbar {
  @apply relative z-10 flex p-0.5 bg-transparent transition-colors;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
}

.app-scrollbar[data-orientation="vertical"] {
  width: var(--scrollbar-size);
}

.app-scrollbar[data-orientation="horizontal"] {
  @apply h-[var(--scrollbar-size)] flex-col;
}

.app-scrollbar[data-state="hidden"] {
  @apply opacity-0;
}

.app-scrollbar:hover,
.app-scroll-area:focus-within .app-scrollbar {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.app-scrollbar-thumb {
  @apply relative flex-1 rounded-full;
  background: var(--scrollbar-thumb, color-mix(in srgb, var(--text) 26%, transparent));
}

.app-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover, color-mix(in srgb, var(--text) 44%, transparent));
}

.app-scrollbar-thumb::before {
  @apply absolute -inset-1;
  content: "";
}

.app-scrollbar-corner {
  @apply bg-transparent;
}

@media (prefers-reduced-motion: reduce) {
  .app-scrollbar {
    transition: none;
  }
}

@media (forced-colors: active) {
  .app-scrollbar-thumb {
    background: CanvasText;
  }
}
</style>
