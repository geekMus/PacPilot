<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import AppScrollArea from "@/components/AppScrollArea.vue";

const props = withDefaults(
  defineProps<{
    height?: number | string;
    empty?: boolean;
    minWidth?: string;
    tableClass?: string;
    rowHeight?: number;
  }>(),
  {
    empty: false,
    minWidth: "760px",
    tableClass: "",
    rowHeight: 56,
  }
);

const emit = defineEmits<{
  ready: [element: HTMLElement];
  scroll: [element: HTMLElement];
}>();

const scroller = ref<HTMLElement | null>(null);

const maxHeight = computed(() => {
  const value = props.height ?? 480;
  return typeof value === "number" ? value + "px" : value;
});
const headerOffset = ref(0);
const frameStyle = computed(() => ({
  "--table-max-height": maxHeight.value,
  "--virtual-row-height": props.rowHeight + "px",
  "--table-min-width": props.minWidth,
}));
let resizeObserver: ResizeObserver | undefined;

function syncHeader(): void {
  const element = scroller.value;
  if (element) {
    headerOffset.value = element.scrollLeft;
  }
}

function onScroll(): void {
  syncHeader();
  if (scroller.value) emit("scroll", scroller.value);
}

function onReady(element: HTMLElement): void {
  scroller.value = element;
  syncHeader();
  emit("ready", element);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(syncHeader);
    resizeObserver.observe(element);
    if (element.parentElement) resizeObserver.observe(element.parentElement);
  }
}

onUnmounted(() => resizeObserver?.disconnect());
</script>

<template>
  <div class="app-table-frame" :class="{ 'is-empty': props.empty }" :style="frameStyle">
    <div class="app-table-header-viewport">
      <table class="app-table virtual-table" :class="props.tableClass" :style="{ transform: `translateX(-${headerOffset}px)` }">
        <colgroup><slot name="columns" /></colgroup>
        <thead><slot name="header" /></thead>
      </table>
    </div>
    <AppScrollArea root-class="app-table-body-scroll" orientation="both" @ready="onReady" @scroll="onScroll">
      <table class="app-table virtual-table" :class="props.tableClass">
        <colgroup><slot name="columns" /></colgroup>
        <tbody><slot name="body" /></tbody>
      </table>
    </AppScrollArea>
  </div>
</template>

<style scoped>
@reference "../styles/tailwind.css";

.app-table-frame {
  @apply flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[10px] border;
  max-height: var(--table-max-height, 480px);
  height: var(--table-max-height, 480px);
  border-color: var(--line);
  background: var(--surface);
  /* Do not trap wheel/touch gestures at this non-scrolling frame. */
  overscroll-behavior: auto;
}
.app-table-header-viewport {
  @apply w-full max-w-full shrink-0 overflow-hidden;
  flex: 0 0 44px;
  height: 44px;
  background: var(--surface-2);
}
.app-table {
  @apply w-full border-separate text-xs;
  min-width: var(--table-min-width);
  border-spacing: 0;
  table-layout: fixed;
}
.app-table :deep(thead th) {
  @apply box-border overflow-hidden border-b px-3 py-2.5 text-left font-bold whitespace-nowrap;
  height: 44px;
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
  text-overflow: ellipsis;
}
.app-table-frame.is-empty .app-table-body-scroll {
  @apply min-h-[98px];
}
.app-table-body-scroll {
  /* A zero flex-basis lets the fixed-height frame allocate the remaining body
     space instead of letting intrinsic table content dictate the scroll area. */
  @apply min-w-0 min-h-0 flex-auto;
  height: 0;
  max-height: calc(var(--table-max-height, 480px) - 44px);
}
.app-table-body-scroll :deep(.app-scroll-area-viewport) {
  @apply h-full;
  max-height: calc(var(--table-max-height, 480px) - 44px);
  overflow-anchor: none;
  /* Let vertical wheel/touch gestures chain to the page when the table cannot scroll. */
  overscroll-behavior-y: auto;
  overscroll-behavior-x: contain;
}
.app-table :deep(tbody td) {
  @apply box-border overflow-hidden border-b px-3 py-2.5 align-middle whitespace-nowrap;
  height: var(--virtual-row-height);
  max-height: var(--virtual-row-height);
  border-color: var(--line);
  text-overflow: ellipsis;
}
.app-table :deep(tbody tr:last-child td) {
  @apply border-b-0;
}
.app-table :deep(tbody tr:hover td) {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.app-table :deep(.actions-cell) {
  @apply overflow-visible;
}
.app-table :deep(.virtual-spacer td) {
  @apply h-auto max-h-none border-0 p-0 leading-none;
}
.app-table :deep(.virtual-state-row td) {
  @apply border-b-0 px-3 py-2.5 text-center;
  height: 42px;
  max-height: none;
  color: var(--muted);
}
.app-table.recent-table {
  @apply text-[10px];
}
.app-table.recent-table :deep(thead th) {
  @apply px-2.5 py-2.5 text-[10px] font-extrabold;
}
.app-table.recent-table :deep(tbody td) {
  @apply px-2.5 py-2.5;
  height: 40px;
  max-height: 40px;
}
</style>
