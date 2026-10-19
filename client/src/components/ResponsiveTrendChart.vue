<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

export interface TrendPoint {
  hour: string;
  requests: number;
  errors: number;
}

interface TrendBucket extends TrendPoint {
  key: string;
  endHour: string;
  pointCount: number;
}

const props = withDefaults(defineProps<{
  points: TrendPoint[];
  timeZone?: string;
  ariaLabel?: string;
  compact?: boolean;
}>(), {
  timeZone: "Asia/Shanghai",
  ariaLabel: "最近 24 小时请求趋势",
  compact: false,
});

const chartElement = ref<HTMLElement | null>(null);
const chartWidth = ref(0);
let resizeObserver: ResizeObserver | undefined;

watch(chartElement, (element) => {
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
}, { flush: "post" });

onUnmounted(() => resizeObserver?.disconnect());

const visiblePoints = computed<TrendBucket[]>(() => {
  const source = props.points ?? [];
  if (!source.length) return [];

  // Keep each bar wide enough to read. When space is tight, merge adjacent
  // hourly samples instead of squeezing all 24 bars into hairline columns.
  const width = chartWidth.value || 960;
  const gap = 4;
  const targetBarWidth = props.compact ? 22 : 24;
  const targetCount = Math.min(
    source.length,
    Math.max(Math.min(source.length, 6), Math.floor((width + gap) / (targetBarWidth + gap))),
  );
  const buckets: TrendBucket[] = [];

  // Distribute samples evenly across the requested number of bars. Using a
  // fixed bucket size can unexpectedly halve the bar count at certain widths.
  for (let bucketIndex = 0; bucketIndex < targetCount; bucketIndex += 1) {
    const startIndex = Math.floor(bucketIndex * source.length / targetCount);
    const endIndex = Math.floor((bucketIndex + 1) * source.length / targetCount);
    const batch = source.slice(startIndex, endIndex);
    if (!batch.length) continue;

    const first = batch[0];
    const last = batch[batch.length - 1];
    buckets.push({
      key: first.hour + "-" + last.hour,
      hour: first.hour,
      endHour: last.hour,
      pointCount: batch.length,
      requests: batch.reduce((total, point) => total + point.requests, 0),
      errors: batch.reduce((total, point) => total + point.errors, 0),
    });
  }
  return buckets;
});

const maxRequests = computed(() =>
  Math.max(1, ...visiblePoints.value.map((point) => point.requests)),
);

const tickIndexes = computed(() => {
  const pointCount = visiblePoints.value.length;
  if (!pointCount) return [];
  const width = chartWidth.value || 960;
  const tickCount = Math.min(pointCount, 6, Math.max(2, Math.floor(width / 110)));
  if (tickCount === 1) return [0];
  return Array.from(
    new Set(Array.from({ length: tickCount }, (_, index) =>
      Math.round(index * (pointCount - 1) / (tickCount - 1)),
    )),
  );
});

function shouldShowTick(index: number): boolean {
  return tickIndexes.value.includes(index);
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

function formatTooltip(point: TrendBucket): string {
  const period = point.pointCount > 1
    ? formatTimestamp(point.hour) + "–" + formatTimestamp(point.endHour) + "（合并 " + point.pointCount + " 个小时点）"
    : formatTimestamp(point.hour);
  return period + " · " + point.requests + " 次请求 · " + point.errors + " 次错误";
}
</script>

<template>
  <div
    ref="chartElement"
    class="responsive-trend-chart"
    :class="{ compact }"
    :style="{ '--trend-columns': visiblePoints.length }"
    role="img"
    :aria-label="ariaLabel"
  >
    <div
      v-for="(point, index) in visiblePoints"
      :key="point.key"
      class="trend-column"
      :title="formatTooltip(point)"
    >
      <div class="trend-track">
        <div class="trend-bar" :style="{ height: (point.requests / maxRequests * 100) + '%' }"></div>
        <div
          v-if="point.errors > 0"
          class="trend-error-bar"
          :style="{ height: (point.errors / maxRequests * 100) + '%' }"
        ></div>
      </div>
      <span class="trend-hour">{{ shouldShowTick(index) ? formatTick(point.hour) : "" }}</span>
    </div>
  </div>
</template>

<style scoped>
.responsive-trend-chart {
  display: grid;
  grid-template-columns: repeat(var(--trend-columns, 24), minmax(0, 1fr));
  align-items: end;
  gap: 4px;
  min-width: 0;
  padding: 6px 2px 0;
  border-bottom: 1px solid var(--line);
}
.trend-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 7px;
  min-width: 0;
}
.trend-track {
  position: relative;
  width: 100%;
  height: 104px;
  overflow: hidden;
  border-radius: 5px 5px 0 0;
  background: color-mix(in srgb, var(--muted) 6%, transparent);
}
.trend-bar,
.trend-error-bar {
  position: absolute;
  right: 13%;
  bottom: 0;
  left: 13%;
  border-radius: 4px 4px 0 0;
}
.trend-bar {
  background: var(--accent);
  opacity: .9;
}
.trend-error-bar {
  min-height: 2px;
  background: var(--red);
  opacity: .95;
}
.trend-hour {
  display: block;
  height: 16px;
  overflow: visible;
  color: var(--muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
}
.responsive-trend-chart.compact .trend-track {
  height: 84px;
}
.responsive-trend-chart.compact .trend-hour {
  height: 15px;
  font-size: 9px;
  line-height: 15px;
}
@media (max-width: 560px) {
  .trend-track { height: 86px; }
  .responsive-trend-chart.compact .trend-track { height: 70px; }
  .trend-hour { font-size: 9px; }
}
@media (max-width: 360px) {
  .trend-track { height: 76px; }
  .responsive-trend-chart.compact .trend-track { height: 64px; }
}
</style>
