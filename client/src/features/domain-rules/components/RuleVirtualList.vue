<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, onUnmounted, ref, watch } from "vue";
import TextDetail from "@/components/TextDetail.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
const { t } = useI18n();

interface RuleEntry {
  domain: string;
  source?: string;
}

const props = withDefaults(
  defineProps<{
    items: RuleEntry[];
    emptyText: string;
    height?: number;
    rowHeight?: number;
    overscan?: number;
  }>(),
  {
    height: 300,
    rowHeight: 36,
    overscan: 6,
  }
);

const scrollTop = ref(0);
const viewport = ref<HTMLElement | null>(null);
const viewportHeight = ref(props.height);
let resizeObserver: ResizeObserver | undefined;
const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - props.overscan)
);
const visibleCount = computed(
  () => Math.ceil(viewportHeight.value / props.rowHeight) + props.overscan * 2
);
const visibleItems = computed(() =>
  props.items.slice(startIndex.value, startIndex.value + visibleCount.value)
);
const totalHeight = computed(() => props.items.length * props.rowHeight);
const offsetY = computed(() => startIndex.value * props.rowHeight);
// 来源标签只在列表混合了多个来源时才有区分价值；整列同源时逐行重复同一个标签
// 只会变成视觉噪音（例如远程代理列表的上千行、全部来自自定义的黑名单）。
const showSources = computed(() => new Set(props.items.map((item) => item.source ?? "")).size > 1);

function sourceClass(source?: string): string {
  if (!source) return "source-neutral";
  const s = source.toLowerCase();
  if (
    source.includes(t("status.sourceCustomBlock")) ||
    source.includes(t("common.blacklist")) ||
    s.includes("block")
  )
    return "source-block";
  if (
    source.includes(t("status.sourceCustomDirect")) ||
    source.includes(t("common.custom")) ||
    s.includes("custom")
  )
    return "source-custom";
  if (
    source.includes(t("status.sourceRemoteException")) ||
    source.includes(t("common.remote")) ||
    s.includes("remote")
  )
    return "source-remote";
  return "source-neutral";
}

function onReady(element: HTMLElement): void {
  viewport.value = element;
  viewportHeight.value = element.clientHeight;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      viewportHeight.value = element.clientHeight;
    });
    resizeObserver.observe(element);
  }
}

onUnmounted(() => resizeObserver?.disconnect());

function onScroll(element: HTMLElement): void {
  scrollTop.value = element.scrollTop;
}

watch(
  () => props.items,
  () => {
    scrollTop.value = 0;
    if (viewport.value) viewport.value.scrollTop = 0;
  }
);
</script>

<template>
  <AppScrollArea
    root-class="virtual-list"
    viewport-class="virtual-list-viewport"
    :style="{ '--rule-list-max-height': props.height + 'px' }"
    role="list"
    :aria-label="t('common.domainRules')"
    @ready="onReady"
    @scroll="onScroll"
  >
    <div v-if="items.length" class="virtual-canvas" :style="{ height: totalHeight + 'px' }">
      <div class="virtual-window" :style="{ transform: `translateY(${offsetY}px)` }">
        <div
          v-for="(item, index) in visibleItems"
          :key="`${item.source || ''}:${item.domain}:${startIndex + index}`"
          class="virtual-row"
          :style="{ height: rowHeight + 'px' }"
          role="listitem"
        >
          <TextDetail :text="item.domain" :label="t('common.domainRules')" class="domain-detail"
            ><code>{{ item.domain }}</code></TextDetail
          >
          <span v-if="showSources && item.source" class="row-source" :class="sourceClass(item.source)">{{
            item.source
          }}</span>
        </div>
      </div>
    </div>
    <div v-else class="virtual-empty">{{ emptyText }}</div>
  </AppScrollArea>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.virtual-list {
  @apply relative rounded-lg border;
  height: fit-content;
  min-height: 108px;
  max-height: var(--rule-list-max-height, 300px);
  border-color: var(--line);
  background: var(--bg);
}
.virtual-list :deep(.virtual-list-viewport) {
  @apply relative;
  height: auto;
  max-height: var(--rule-list-max-height, 300px);
}
.virtual-canvas {
  @apply relative min-w-0;
}
.virtual-window {
  @apply absolute inset-x-0 top-0;
}
.virtual-row {
  @apply box-border flex min-w-0 items-center gap-2.5 border-b px-2.5;
  border-color: var(--line);
}
.virtual-row:last-child {
  @apply border-b-0;
}
.virtual-row > .domain-detail {
  @apply flex-auto text-xs;
}
.virtual-row > .domain-detail :deep(code) {
  @apply inline border-0 bg-transparent p-0 text-xs;
  color: var(--text);
}
.row-source {
  @apply inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border px-[7px] py-[3px] text-center text-[10px] font-bold leading-snug;
  max-width: min(124px, 40%);
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-source.source-custom {
  border-color: color-mix(in srgb, var(--green) 32%, var(--line));
  background: var(--green-soft);
  color: var(--green);
}
.row-source.source-remote {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}
.row-source.source-block {
  border-color: color-mix(in srgb, var(--red) 32%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
.virtual-empty {
  @apply box-border grid h-full place-items-center p-3 text-center text-[11px];
  min-height: 88px;
  color: var(--muted);
}
</style>
