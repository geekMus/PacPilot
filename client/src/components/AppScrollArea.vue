<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "reka-ui";

withDefaults(defineProps<{
  orientation?: "vertical" | "horizontal" | "both";
  type?: "auto" | "always" | "scroll" | "hover";
  rootClass?: string;
  viewportClass?: string;
}>(), {
  orientation: "vertical",
  type: "hover",
  rootClass: "",
  viewportClass: "",
});

const emit = defineEmits<{
  ready: [element: HTMLElement];
  scroll: [element: HTMLElement];
}>();
const viewport = ref<HTMLElement | null>(null);

onMounted(() => {
  if (viewport.value) emit("ready", viewport.value);
});
function onScroll(): void {
  if (viewport.value) emit("scroll", viewport.value);
}
</script>

<template>
  <ScrollAreaRoot class="app-scroll-area" :class="rootClass" :type="type" :scroll-hide-delay="500">
    <ScrollAreaViewport
      ref="viewport"
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
.app-scroll-area {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  --scrollbar-size: 8px;
}
.app-scroll-area-viewport {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.app-scroll-area-viewport:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.app-scrollbar {
  display: flex;
  touch-action: none;
  user-select: none;
  padding: 2px;
  background: transparent;
  transition: background-color 150ms ease, opacity 150ms ease;
}
.app-scrollbar[data-orientation="vertical"] { width: var(--scrollbar-size); }
.app-scrollbar[data-orientation="horizontal"] {
  height: var(--scrollbar-size);
  flex-direction: column;
}
.app-scrollbar[data-state="hidden"] { opacity: 0; }
.app-scrollbar:hover,
.app-scroll-area:focus-within .app-scrollbar {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}
.app-scrollbar-thumb {
  position: relative;
  flex: 1;
  border-radius: 999px;
  background: var(--scrollbar-thumb, color-mix(in srgb, var(--text) 26%, transparent));
}
.app-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover, color-mix(in srgb, var(--text) 44%, transparent));
}
.app-scrollbar-thumb::before { content: ""; position: absolute; inset: -4px; }
.app-scrollbar-corner { background: transparent; }
@media (prefers-reduced-motion: reduce) { .app-scrollbar { transition: none; } }
@media (forced-colors: active) { .app-scrollbar-thumb { background: CanvasText; } }
</style>
