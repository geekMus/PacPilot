<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

export interface TrendPoint {
  hour: string;
  requests: number;
  errors: number;
  averageResponseMs?: number;
}

interface TrendBucket extends TrendPoint {
  key: string;
  endHour: string;
  pointCount: number;
}

const props = withDefaults(
  defineProps<{
    points: TrendPoint[];
    timeZone?: string;
    ariaLabel?: string;
    compact?: boolean;
    mode?: "count" | "latency";
  }>(),
  {
    timeZone: "Asia/Shanghai",
    ariaLabel: "最近 24 小时请求趋势",
    compact: false,
    mode: "count",
  }
);

const chartElement = ref<HTMLElement | null>(null);
const chartWidth = ref(0);
const activeIndex = ref<number | null>(null);
let resizeObserver: ResizeObserver | undefined;

watch(
  chartElement,
  (element) => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (!element) return;
    const updateWidth = (width: number) => {
      if (Number.isFinite(width) && width > 0) chartWidth.value = width;
    };
    updateWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        updateWidth(entries[0]?.contentRect.width ?? element.getBoundingClientRect().width);
      });
      resizeObserver.observe(element);
    }
  },
  { flush: "post" }
);

onUnmounted(() => resizeObserver?.disconnect());

const visiblePoints = computed<TrendBucket[]>(() => {
  const source = props.points ?? [];
  if (!source.length) return [];
  const width = chartWidth.value || 960;
  const gap = 4;
  const targetBarWidth = props.compact ? 20 : 22;
  const targetCount = Math.min(
    source.length,
    Math.max(Math.min(source.length, 6), Math.floor((width + gap) / (targetBarWidth + gap)))
  );
  const buckets: TrendBucket[] = [];
  for (let bucketIndex = 0; bucketIndex < targetCount; bucketIndex += 1) {
    const startIndex = Math.floor((bucketIndex * source.length) / targetCount);
    const endIndex = Math.floor(((bucketIndex + 1) * source.length) / targetCount);
    const batch = source.slice(startIndex, endIndex);
    if (!batch.length) continue;
    const first = batch[0];
    const last = batch[batch.length - 1];
    if (props.mode === "latency") {
      let weight = 0;
      let sum = 0;
      for (const point of batch) {
        const latency = Number(point.averageResponseMs ?? point.requests) || 0;
        const w = Math.max(1, Number(point.requests) || 1);
        sum += latency * w;
        weight += w;
      }
      buckets.push({
        key: first.hour + "-" + last.hour,
        hour: first.hour,
        endHour: last.hour,
        pointCount: batch.length,
        requests: Math.round((sum / Math.max(weight, 1)) * 10) / 10,
        errors: 0,
      });
    } else {
      buckets.push({
        key: first.hour + "-" + last.hour,
        hour: first.hour,
        endHour: last.hour,
        pointCount: batch.length,
        requests: batch.reduce((total, point) => total + point.requests, 0),
        errors: batch.reduce((total, point) => total + point.errors, 0),
      });
    }
  }
  return buckets;
});

const maxValue = computed(() => Math.max(1, ...visiblePoints.value.map((point) => point.requests)));

const yMax = computed(() => {
  const raw = maxValue.value;
  if (raw <= 1) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / exp;
  const nice = norm <= 1.5 ? 1.5 : norm <= 2 ? 2 : norm <= 3 ? 3 : norm <= 5 ? 5 : 10;
  return nice * exp;
});

const yTicks = computed(() => {
  const top = yMax.value;
  return [top, top * 0.5, 0].map((value) => ({
    value,
    label: formatAxisValue(value),
  }));
});

const tickIndexes = computed(() => {
  const pointCount = visiblePoints.value.length;
  if (!pointCount) return [];
  const width = chartWidth.value || 960;
  const tickCount = Math.min(pointCount, width < 420 ? 4 : 6, Math.max(2, Math.floor(width / 100)));
  if (tickCount === 1) return [0];
  return Array.from(
    new Set(
      Array.from({ length: tickCount }, (_, index) =>
        Math.round((index * (pointCount - 1)) / (tickCount - 1))
      )
    )
  );
});

function shouldShowTick(index: number): boolean {
  return tickIndexes.value.includes(index);
}

function formatAxisValue(value: number): string {
  if (props.mode === "latency") {
    if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1) + "s";
    return String(Math.round(value));
  }
  if (value >= 1000) return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + "k";
  return String(Math.round(value));
}

function formatTick(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: props.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: props.timeZone,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatDurationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms < 1000) return Math.round(ms * 10) / 10 + " ms";
  return (ms / 1000).toFixed(2) + " s";
}

function formatTooltip(point: TrendBucket): string {
  const period =
    point.pointCount > 1
      ? formatTimestamp(point.hour) + "–" + formatTimestamp(point.endHour) + "（合并 " + point.pointCount + " 小时）"
      : formatTimestamp(point.hour);
  if (props.mode === "latency") return period + " · 平均 " + formatDurationLabel(point.requests);
  return period + " · " + point.requests + " 次请求 · " + point.errors + " 次错误";
}

function barHeight(value: number): string {
  return Math.max(0, Math.min(100, (value / yMax.value) * 100)) + "%";
}
</script>

<template>
  <div
    ref="chartElement"
    class="responsive-trend-chart"
    :class="{ compact, latency: mode === 'latency' }"
    role="img"
    :aria-label="ariaLabel"
  >
    <div class="chart-plot">
      <div class="y-axis" aria-hidden="true">
        <span v-for="tick in yTicks" :key="'y-' + tick.value">{{ tick.label }}</span>
      </div>
      <div class="plot-area">
        <div class="grid-lines" aria-hidden="true">
          <i v-for="tick in yTicks" :key="'g-' + tick.value"></i>
        </div>
        <div class="bars" :style="{ '--trend-columns': visiblePoints.length }">
          <div
            v-for="(point, index) in visiblePoints"
            :key="point.key"
            class="trend-column"
            :class="{ active: activeIndex === index }"
            :title="formatTooltip(point)"
            @mouseenter="activeIndex = index"
            @mouseleave="activeIndex = null"
            @focusin="activeIndex = index"
            @focusout="activeIndex = null"
          >
            <div class="trend-track">
              <div class="trend-bar" :style="{ height: barHeight(point.requests) }"></div>
              <div
                v-if="mode === 'count' && point.errors > 0"
                class="trend-error-bar"
                :style="{ height: barHeight(point.errors) }"
              ></div>
              <div v-if="activeIndex === index" class="trend-tooltip" role="tooltip">
                {{ formatTooltip(point) }}
              </div>
            </div>
            <span class="trend-hour">{{ shouldShowTick(index) ? formatTick(point.hour) : "\u00a0" }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.responsive-trend-chart { min-width: 0; padding: 4px 0 0; }
.chart-plot {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
}
.y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 0 22px;
  color: var(--muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-align: right;
  user-select: none;
}
.plot-area { position: relative; min-width: 0; }
.grid-lines {
  position: absolute;
  inset: 0 0 22px 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}
.grid-lines i {
  display: block;
  height: 0;
  border-top: 1px dashed color-mix(in srgb, var(--line) 88%, var(--muted));
}
.grid-lines i:last-child {
  border-top-style: solid;
  border-top-color: var(--line);
}
.bars {
  display: grid;
  grid-template-columns: repeat(var(--trend-columns, 24), minmax(0, 1fr));
  align-items: end;
  gap: 3px;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.trend-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
}
.trend-track {
  position: relative;
  width: 100%;
  height: 120px;
  overflow: visible;
}
.trend-bar,
.trend-error-bar {
  position: absolute;
  right: 12%;
  bottom: 0;
  left: 12%;
  border-radius: 5px 5px 2px 2px;
  transition: height 0.2s ease, filter 0.15s ease;
}
.trend-bar {
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 88%, white) 0%, var(--accent) 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
}
.latency .trend-bar {
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 65%, #7dd3fc) 0%, var(--accent) 100%);
}
.trend-error-bar {
  min-height: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--red) 70%, white), var(--red));
}
.trend-column.active .trend-bar,
.trend-column:hover .trend-bar { filter: brightness(1.06); }
.trend-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  z-index: 3;
  width: max-content;
  max-width: min(240px, 70vw);
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
  line-height: 1.4;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 12%, transparent);
  transform: translateX(-50%);
  pointer-events: none;
  white-space: normal;
}
.trend-hour {
  display: block;
  height: 16px;
  color: var(--muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
}
.compact .trend-track { height: 92px; }
.compact .y-axis { padding-bottom: 20px; }
.compact .grid-lines { inset: 0 0 20px 0; }
@media (max-width: 560px) {
  .chart-plot { grid-template-columns: 28px minmax(0, 1fr); gap: 6px; }
  .y-axis { font-size: 9px; padding-bottom: 20px; }
  .trend-track { height: 96px; }
  .compact .trend-track { height: 78px; }
  .trend-hour { font-size: 9px; }
  .trend-bar, .trend-error-bar { left: 8%; right: 8%; }
  .trend-tooltip { max-width: min(200px, 78vw); font-size: 10px; }
}
</style>
