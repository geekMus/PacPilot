<script setup lang="ts">
import { computed, ref, watch } from "vue";
import TextDetail from "./TextDetail.vue";

interface RuleEntry {
  domain: string;
  source?: string;
}

const props = withDefaults(defineProps<{
  items: RuleEntry[];
  emptyText: string;
  height?: number;
  rowHeight?: number;
  overscan?: number;
}>(), {
  height: 300,
  rowHeight: 36,
  overscan: 6,
});

const scrollTop = ref(0);
const viewport = ref<HTMLDivElement | null>(null);
const viewportHeight = computed(() =>
  Math.min(props.height, Math.max(props.rowHeight * 3, props.items.length * props.rowHeight))
);
const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - props.overscan)
);
const visibleCount = computed(() =>
  Math.ceil(viewportHeight.value / props.rowHeight) + props.overscan * 2
);
const visibleItems = computed(() =>
  props.items.slice(startIndex.value, startIndex.value + visibleCount.value)
);
const totalHeight = computed(() => props.items.length * props.rowHeight);
const offsetY = computed(() => startIndex.value * props.rowHeight);

function sourceClass(source?: string): string {
  if (!source) return "source-neutral";
  if (source.includes("黑名单")) return "source-block";
  if (source.includes("自定义")) return "source-custom";
  if (source.includes("远程")) return "source-remote";
  return "source-neutral";
}

function onScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLDivElement).scrollTop;
}

watch(() => props.items, () => {
  scrollTop.value = 0;
  if (viewport.value) viewport.value.scrollTop = 0;
});
</script>

<template>
  <div
    ref="viewport"
    class="virtual-list"
    :style="{ height: viewportHeight + 'px' }"
    role="list"
    aria-label="域名规则列表"
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
          <TextDetail :text="item.domain" label="域名规则" class="domain-detail"><code>{{ item.domain }}</code></TextDetail>
          <span
            v-if="item.source"
            class="row-source"
            :class="sourceClass(item.source)"
          >{{ item.source }}</span>
        </div>
      </div>
    </div>
    <div v-else class="virtual-empty">{{ emptyText }}</div>
  </div>
</template>

<style scoped>
.virtual-list {
  position: relative;
  max-height: 300px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
.virtual-list::-webkit-scrollbar { width: var(--scrollbar-size); }
.virtual-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 999px; }
.virtual-canvas { position: relative; min-width: 0; }
.virtual-window { position: absolute; inset: 0 0 auto; }
.virtual-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0 10px;
  border-bottom: 1px solid var(--line);
}
.virtual-row:last-child { border-bottom: 0; }
.virtual-row > .domain-detail {
  flex: 1 1 auto;
  font-size: 11px;
}
.row-source {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  max-width: 124px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
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
