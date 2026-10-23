<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, ref, watch } from "vue";
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
const viewportHeight = computed(() =>
  Math.min(props.height, Math.max(props.rowHeight * 3, props.items.length * props.rowHeight))
);
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
}

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
    :style="{ height: viewportHeight + 'px' }"
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
          <span v-if="item.source" class="row-source" :class="sourceClass(item.source)">{{
            item.source
          }}</span>
        </div>
      </div>
    </div>
    <div v-else class="virtual-empty">{{ emptyText }}</div>
  </AppScrollArea>
</template>

<style scoped>
.virtual-list {
  position: relative;
  max-height: 300px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
}
.virtual-list :deep(.virtual-list-viewport) {
  position: relative;
}
.virtual-canvas {
  position: relative;
  min-width: 0;
}
.virtual-window {
  position: absolute;
  inset: 0 0 auto;
}
.virtual-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0 10px;
  border-bottom: 1px solid var(--line);
}
.virtual-row:last-child {
  border-bottom: 0;
}
.virtual-row > .domain-detail {
  flex: 1 1 auto;
  font-size: 12px;
}
.virtual-row > .domain-detail :deep(code) {
  display: inline;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.row-source {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  max-width: min(124px, 40%);
  overflow: hidden;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
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
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 88px;
  padding: 12px;
  box-sizing: border-box;
  color: var(--muted);
  text-align: center;
  font-size: 11px;
}
</style>
