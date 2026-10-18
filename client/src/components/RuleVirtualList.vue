<script setup lang="ts">
import { computed, ref, watch } from "vue";

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
  rowHeight: 32,
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
          <code :title="item.domain">{{ item.domain }}</code>
          <span v-if="item.source" class="row-source">{{ item.source }}</span>
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
.virtual-row code {
  display: block;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.row-source {
  flex: 0 0 auto;
  max-width: 84px;
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
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
