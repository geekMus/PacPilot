<script setup lang="ts" generic="T">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import TableFrame from "@/components/TableFrame.vue";

const props = withDefaults(
  defineProps<{
    items: T[];
    itemKey: keyof T;
    colSpan: number;
    rowHeight?: number;
    height?: number | string;
    minWidth?: string;
    tableClass?: string;
    hasMore?: boolean;
    loading?: boolean;
    error?: string;
    emptyText?: string;
    loadMore: () => void | Promise<void>;
  }>(),
  {
    rowHeight: 56,
    minWidth: "760px",
    tableClass: "",
    hasMore: false,
    loading: false,
    error: "",
    emptyText: "",
  }
);
const { t } = useI18n();
const scroller = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(436);
const overscan = 6;
const resolvedEmptyText = computed(() => props.emptyText || t("common.noRecords"));

// Treat height as the maximum viewport height. Small result sets shrink to their
// content instead of leaving a mostly empty fixed-height frame.
const resolvedHeight = computed(() => {
  const configured = props.height ?? 480;
  const maxHeight =
    typeof configured === "number"
      ? configured
      : /^\d+(?:\.\d+)?px$/.test(configured)
        ? Number.parseFloat(configured)
        : 480;
  const stateRowHeight = 42;
  const emptyBodyHeight = 98;
  const contentHeight =
    !props.items.length && !props.loading && !props.error
      ? 44 + emptyBodyHeight
      : 44 + props.items.length * props.rowHeight + stateRowHeight;
  return `${Math.min(maxHeight, contentHeight)}px`;
});

const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - overscan)
);
const visibleCount = computed(
  () => Math.ceil(viewportHeight.value / props.rowHeight) + overscan * 2
);
const endIndex = computed(() =>
  Math.min(props.items.length, startIndex.value + visibleCount.value)
);
const visibleItems = computed(() => props.items.slice(startIndex.value, endIndex.value));
const topPadding = computed(() => startIndex.value * props.rowHeight);
const bottomPadding = computed(() =>
  Math.max(0, (props.items.length - endIndex.value) * props.rowHeight)
);

let resizeObserver: ResizeObserver | undefined;
let previousItems: T[] = [];

function measureViewport(element = scroller.value): void {
  if (!element) return;
  scrollTop.value = element.scrollTop;
  viewportHeight.value = Math.max(props.rowHeight, element.clientHeight);
}

function onReady(element: HTMLElement): void {
  scroller.value = element;
  measureViewport(element);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => measureViewport(element));
    resizeObserver.observe(element);
  }
}

function maybeLoadMore(element: HTMLElement): void {
  if (!props.hasMore || props.loading || props.error) return;
  if (element.scrollHeight - element.scrollTop - element.clientHeight <= props.rowHeight * 3)
    void props.loadMore();
}

function onScroll(element: HTMLElement): void {
  measureViewport(element);
  maybeLoadMore(element);
}

function retry(): void {
  if (!props.loading) void props.loadMore();
}

async function preserveScrollAnchor(nextItems: T[]): Promise<void> {
  const oldItems = previousItems;
  previousItems = nextItems.slice();
  const element = scroller.value;
  if (!element || !oldItems.length) return;
  if (!nextItems.length) {
    await nextTick();
    if (scroller.value === element) {
      element.scrollTop = 0;
      measureViewport(element);
    }
    return;
  }

  const priorScrollTop = element.scrollTop;
  const firstVisibleIndex = Math.min(
    oldItems.length - 1,
    Math.max(0, Math.floor(Math.max(0, priorScrollTop) / props.rowHeight))
  );
  const anchorKey = oldItems[firstVisibleIndex]?.[props.itemKey];
  const nextIndex = nextItems.findIndex((item) => item[props.itemKey] === anchorKey);
  await nextTick();
  if (scroller.value !== element) return;
  element.scrollTop =
    nextIndex < 0
      ? 0
      : Math.max(0, priorScrollTop + (nextIndex - firstVisibleIndex) * props.rowHeight);
  measureViewport(element);
}

watch(
  () => [props.items, props.items.length] as const,
  ([items]) => {
    void preserveScrollAnchor(items);
  },
  { flush: "pre" }
);

onMounted(() => {
  previousItems = props.items.slice();
  measureViewport();
});
onUnmounted(() => resizeObserver?.disconnect());
</script>

<template>
  <TableFrame
    :height="resolvedHeight"
    :empty="!props.items.length && !props.loading && !props.error"
    :min-width="props.minWidth"
    :table-class="props.tableClass"
    :row-height="props.rowHeight"
    @ready="onReady"
    @scroll="onScroll"
  >
    <template #columns><slot name="columns" /></template>
    <template #header><slot name="header" /></template>
    <template #body>
      <tr v-if="topPadding > 0" class="virtual-spacer" aria-hidden="true">
        <td :colspan="colSpan" :style="{ height: topPadding + 'px' }"></td>
      </tr>
      <template v-for="(item, index) in visibleItems" :key="String(item[itemKey])">
        <slot name="row" :item="item" :index="startIndex + index" />
      </template>
      <tr v-if="bottomPadding > 0" class="virtual-spacer" aria-hidden="true">
        <td :colspan="colSpan" :style="{ height: bottomPadding + 'px' }"></td>
      </tr>
      <tr v-if="loading" class="virtual-state-row">
        <td :colspan="colSpan">
          <span class="virtual-state"><span class="virtual-spinner"></span>{{ t("virtualTable.loadingMore") }}</span>
        </td>
      </tr>
      <tr v-else-if="error" class="virtual-state-row">
        <td :colspan="colSpan">
          <div class="virtual-state is-error">
            {{ error }} <button type="button" @click="retry">{{ t("common.retry") }}</button>
          </div>
        </td>
      </tr>
      <tr v-else-if="!items.length" class="virtual-state-row">
        <td :colspan="colSpan">
          <div class="virtual-empty-state">
            <span>{{ resolvedEmptyText }}</span>
            <button v-if="hasMore" type="button" @click="retry">{{ t("virtualTable.loadNextBatch") }}</button>
          </div>
        </td>
      </tr>
      <tr v-else-if="!hasMore" class="virtual-state-row">
        <td :colspan="colSpan">
          <span class="virtual-state is-muted">{{ t("virtualTable.loadedAll", { n: items.length }) }}</span>
        </td>
      </tr>
      <tr v-else class="virtual-state-row">
        <td :colspan="colSpan">
          <span class="virtual-state is-muted">{{ t("virtualTable.scrollOrLoad") }}
            <button type="button" @click="retry">{{ t("virtualTable.loadNextBatch") }}</button>
          </span>
        </td>
      </tr>
    </template>
  </TableFrame>
</template>

<style scoped>
.virtual-table :deep(.actions-cell) {
  overflow: visible;
}
.virtual-table :deep(.virtual-spacer td) {
  height: auto;
  max-height: none;
  padding: 0 !important;
  border: 0 !important;
  line-height: 0;
}
.virtual-table :deep(.virtual-state-row td) {
  height: 42px;
  padding: 10px 12px;
  text-align: center;
  color: var(--muted);
  border-bottom: 0;
}
.virtual-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
}
.virtual-state.is-error {
  color: var(--red);
}
.virtual-state.is-muted {
  color: var(--muted);
}
.virtual-state button,
.virtual-empty-state button {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 9px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
}
.virtual-state button:hover,
.virtual-empty-state button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.virtual-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.virtual-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: virtual-spin 0.8s linear infinite;
}
@keyframes virtual-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .virtual-spinner { animation-duration: 0.01ms; animation-iteration-count: 1; }
}
</style>
