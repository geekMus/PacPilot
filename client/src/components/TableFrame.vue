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
const headerViewportWidth = ref("100%");
const headerOffset = ref(0);
const frameStyle = computed(() => ({
  // 144px keeps the 44px header and empty row comfortable without leaving a large blank panel.
  height: typeof (props.height ?? (props.empty ? 144 : 480)) === "number"
    ? (props.height ?? (props.empty ? 144 : 480)) + "px"
    : (props.height ?? (props.empty ? 144 : 480)),
  "--virtual-row-height": props.rowHeight + "px",
  "--table-min-width": props.minWidth,
}));
let resizeObserver: ResizeObserver | undefined;

function syncHeader(): void {
  const element = scroller.value;
  if (!element) return;
  headerViewportWidth.value = element.clientWidth + "px";
  headerOffset.value = element.scrollLeft;
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
  <div class="app-table-frame" :style="frameStyle">
    <div class="app-table-header-viewport" :style="{ width: headerViewportWidth }">
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
.app-table-frame {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
  /* Do not trap wheel/touch gestures at this non-scrolling frame. */
  overscroll-behavior: auto;
}
.app-table-header-viewport {
  flex: 0 0 44px;
  height: 44px;
  max-width: 100%;
  overflow: hidden;
  background: var(--surface-2);
}
.app-table {
  width: 100%;
  min-width: var(--table-min-width);
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 12px;
}
.app-table :deep(thead th) {
  box-sizing: border-box;
  height: 44px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
  text-align: left;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-table-body-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 0;
}
.app-table-body-scroll :deep(.app-scroll-area-viewport) {
  overflow-anchor: none;
  /* Let vertical wheel/touch gestures chain to the page when the table cannot scroll. */
  overscroll-behavior-y: auto;
  overscroll-behavior-x: contain;
}
.app-table :deep(tbody td) {
  box-sizing: border-box;
  height: var(--virtual-row-height);
  max-height: var(--virtual-row-height);
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-table :deep(tbody tr:last-child td) {
  border-bottom: 0;
}
.app-table :deep(tbody tr:hover td) {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.app-table :deep(.actions-cell) {
  overflow: visible;
}
.app-table :deep(.virtual-spacer td) {
  height: auto;
  max-height: none;
  padding: 0 !important;
  border: 0 !important;
  line-height: 0;
}
.app-table :deep(.virtual-state-row td) {
  height: 42px;
  max-height: none;
  padding: 10px 12px;
  text-align: center;
  color: var(--muted);
  border-bottom: 0;
}
.app-table.recent-table {
  font-size: 10px;
}
.app-table.recent-table :deep(thead th) {
  padding: 10px;
  font-size: 10px;
  font-weight: 800;
}
.app-table.recent-table :deep(tbody td) {
  padding: 10px;
  height: 40px;
  max-height: 40px;
}
</style>
