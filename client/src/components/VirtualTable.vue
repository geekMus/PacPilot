<script setup lang="ts" generic="T">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

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
    height: 480,
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
const viewportHeight = ref(480);
const headerHeight = ref(44);
const overscan = 6;
const resolvedEmptyText = computed(() => props.emptyText || t("common.noRecords"));

// The sticky header remains in normal table flow. Exclude its height from the
// virtual row offset so row measurements and scroll position use the same origin.
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
const style = computed(() => ({
  height: typeof props.height === "number" ? props.height + "px" : props.height,
  "--virtual-row-height": props.rowHeight + "px",
}));
let resizeObserver: ResizeObserver | undefined;
let previousItems: T[] = [];

function measureViewport(): void {
  const element = scroller.value;
  if (!element) return;
  const header = element.querySelector("thead");
  headerHeight.value = header?.getBoundingClientRect().height || 44;
  scrollTop.value = Math.max(0, element.scrollTop - headerHeight.value);
  viewportHeight.value = Math.max(props.rowHeight, element.clientHeight - headerHeight.value);
}

function maybeLoadMore(): void {
  const element = scroller.value;
  if (!element || !props.hasMore || props.loading || props.error) return;
  if (element.scrollHeight - element.scrollTop - element.clientHeight <= props.rowHeight * 3)
    void props.loadMore();
}

function onScroll(): void {
  measureViewport();
  maybeLoadMore();
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
      measureViewport();
    }
    return;
  }

  const priorScrollTop = element.scrollTop;
  const firstVisibleIndex = Math.min(
    oldItems.length - 1,
    Math.max(0, Math.floor(Math.max(0, priorScrollTop - headerHeight.value) / props.rowHeight))
  );
  const anchorKey = oldItems[firstVisibleIndex]?.[props.itemKey];
  const nextIndex = nextItems.findIndex((item) => item[props.itemKey] === anchorKey);
  await nextTick();
  if (scroller.value !== element) return;
  // Keep the same record at the same viewport position when new records arrive above it.
  element.scrollTop =
    nextIndex < 0
      ? 0
      : Math.max(0, priorScrollTop + (nextIndex - firstVisibleIndex) * props.rowHeight);
  measureViewport();
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
  if (scroller.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(scroller.value);
    const header = scroller.value.querySelector("thead");
    if (header) resizeObserver.observe(header);
  }
});
onUnmounted(() => resizeObserver?.disconnect());
</script>

<template>
  <div ref="scroller" class="virtual-table-scroll" :style="style" @scroll.passive="onScroll">
    <table class="virtual-table" :class="tableClass" :style="{ minWidth }">
      <colgroup>
        <slot name="columns" />
      </colgroup>
      <thead>
        <slot name="header" />
      </thead>
      <tbody>
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
            <span class="virtual-state"
              ><span class="virtual-spinner"></span>{{ t("virtualTable.loadingMore") }}</span
            >
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
            <span class="virtual-state is-muted"
              >{{ t("virtualTable.scrollOrLoad") }} <button type="button" @click="retry">{{ t("virtualTable.loadNextBatch") }}</button></span
            >
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.virtual-table-scroll {
  width: 100%;
  max-height: 100%;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  overflow-anchor: none;
}
.virtual-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 12px;
}
.virtual-table :deep(th) {
  position: sticky;
  top: 0;
  z-index: 3;
  box-sizing: border-box;
  height: 44px;
  padding: 10px 12px;
  color: var(--muted);
  background: var(--surface-2);
  text-align: left;
  font-weight: 700;
  white-space: nowrap;
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  text-overflow: ellipsis;
}
.virtual-table :deep(td) {
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
.virtual-table :deep(tbody tr:not(.virtual-spacer):not(.virtual-state-row):hover td) {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
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
  to {
    transform: rotate(360deg);
  }
}
</style>
