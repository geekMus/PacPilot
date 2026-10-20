<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsType } from "echarts/core";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface TrendPoint {
  hour: string;
  requests: number;
  errors: number;
  averageResponseMs?: number;
}

const props = withDefaults(
  defineProps<{
    points: TrendPoint[];
    timeZone?: string;
    ariaLabel?: string;
    compact?: boolean;
    /** count: 请求量柱状图；latency: 耗时折线图 */
    mode?: "count" | "latency";
  }>(),
  {
    timeZone: "Asia/Shanghai",
    ariaLabel: "最近 24 小时趋势",
    compact: false,
    mode: "count",
  }
);

const host = ref<HTMLElement | null>(null);
const chart = shallowRef<EChartsType | null>(null);
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Append hex alpha when color is #RRGGBB; otherwise return original. */
function withAlpha(color: string, alpha: string): string {
  const c = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c + alpha;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1], g = c[2], b = c[3];
    return "#" + r + r + g + g + b + b + alpha;
  }
  return c;
}

function formatHour(value: string): string {
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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms < 1000) return Math.round(ms * 10) / 10 + " ms";
  return (ms / 1000).toFixed(2) + " s";
}

const categories = computed(() => (props.points ?? []).map((point) => formatHour(point.hour)));
const requestSeries = computed(() => (props.points ?? []).map((point) => point.requests || 0));
const errorSeries = computed(() => (props.points ?? []).map((point) => point.errors || 0));
const latencySeries = computed(() =>
  (props.points ?? []).map((point) => Number(point.averageResponseMs ?? 0) || 0)
);

function buildOption(): Record<string, unknown> {
  const accent = cssVar("--accent", "#3556d8");
  const red = cssVar("--red", "#b4233a");
  const text = cssVar("--text", "#1a2332");
  const muted = cssVar("--muted", "#5f6d82");
  const line = cssVar("--line", "#e4e9f0");
  const surface = cssVar("--surface", "#ffffff");
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches;
  const chartHeight = props.compact ? (isMobile ? 160 : 180) : isMobile ? 200 : 240;

  if (host.value) {
    host.value.style.height = chartHeight + "px";
  }

  const baseGrid = {
    left: isMobile ? 8 : 12,
    right: isMobile ? 8 : 14,
    top: 16,
    bottom: isMobile ? 28 : 32,
    containLabel: true,
  };

  const axisCommon = {
    axisLine: { lineStyle: { color: line } },
    axisTick: { show: false },
    axisLabel: {
      color: muted,
      fontSize: isMobile ? 10 : 11,
      fontFamily: 'var(--font)',
    },
    splitLine: {
      show: true,
      lineStyle: { color: line, type: "dashed" as const, opacity: 0.9 },
    },
  };

  const tooltip = {
    trigger: "axis" as const,
    backgroundColor: surface,
    borderColor: line,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: text, fontSize: 12, fontFamily: 'var(--font)' },
    extraCssText: "box-shadow:0 10px 28px rgba(0,0,0,.12);border-radius:10px;",
  };

  if (props.mode === "latency") {
    return {
      animationDuration: 280,
      grid: baseGrid,
      tooltip: {
        ...tooltip,
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as { dataIndex?: number; value?: number };
          const index = first?.dataIndex ?? 0;
          const point = props.points[index];
          if (!point) return "";
          return (
            '<div style="font-weight:700;margin-bottom:4px">' +
            formatTimestamp(point.hour) +
            "</div>" +
            '<div style="color:' +
            muted +
            '">平均响应</div>' +
            "<div>" +
            formatDuration(Number(first?.value) || 0) +
            "</div>"
          );
        },
      },
      xAxis: {
        type: "category",
        data: categories.value,
        boundaryGap: false,
        axisLine: { lineStyle: { color: line } },
        axisTick: { show: false },
        axisLabel: {
          color: muted,
          fontSize: isMobile ? 10 : 11,
          interval: Math.max(0, Math.floor(categories.value.length / (isMobile ? 4 : 6)) - 1),
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: {
          color: muted,
          fontSize: isMobile ? 10 : 11,
          formatter: (value: number) => (value >= 1000 ? (value / 1000).toFixed(1) + "s" : String(Math.round(value))),
        },
        splitLine: { lineStyle: { color: line, type: "dashed" } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: "平均响应",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: isMobile ? 5 : 6,
          showSymbol: categories.value.length <= 12,
          data: latencySeries.value,
          lineStyle: { width: 2.5, color: accent },
          itemStyle: { color: accent },
          areaStyle: {
            color: withAlpha(accent, "33"),
          },
        },
      ],
    };
  }

  return {
    animationDuration: 280,
    grid: baseGrid,
    legend: {
      show: false,
      data: ["请求", "错误"],
    },
    tooltip: {
      ...tooltip,
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{
          dataIndex?: number;
          seriesName?: string;
          value?: number;
          marker?: string;
        }>;
        const index = list[0]?.dataIndex ?? 0;
        const point = props.points[index];
        if (!point) return "";
        const rows = list
          .map((item) => {
            const label = item.seriesName === "错误" ? "错误请求" : "请求总量";
            return (
              '<div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px">' +
              "<span>" +
              (item.marker || "") +
              " " +
              label +
              "</span><strong>" +
              (item.value ?? 0) +
              "</strong></div>"
            );
          })
          .join("");
        return (
          '<div style="font-weight:700;margin-bottom:2px">' +
          formatTimestamp(point.hour) +
          "</div>" +
          rows
        );
      },
    },
    xAxis: {
      type: "category",
      data: categories.value,
      axisLine: { lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: {
        color: muted,
        fontSize: isMobile ? 10 : 11,
        interval: Math.max(0, Math.floor(categories.value.length / (isMobile ? 4 : 6)) - 1),
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      minInterval: 1,
      axisLabel: { color: muted, fontSize: isMobile ? 10 : 11 },
      splitLine: { lineStyle: { color: line, type: "dashed" } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: "请求",
        type: "bar",
        barMaxWidth: isMobile ? 14 : 18,
        itemStyle: {
          color: accent,
          borderRadius: [4, 4, 0, 0],
        },
        data: requestSeries.value,
        z: 1,
      },
      {
        name: "错误",
        type: "bar",
        barMaxWidth: isMobile ? 14 : 18,
        barGap: "-100%",
        itemStyle: {
          color: red,
          borderRadius: [4, 4, 0, 0],
          opacity: 0.92,
        },
        data: errorSeries.value,
        z: 2,
      },
    ],
  };
}

function renderChart() {
  if (!host.value) return;
  if (!props.points?.length) {
    chart.value?.clear();
    return;
  }
  if (!chart.value) {
    chart.value = echarts.init(host.value, undefined, { renderer: "canvas" });
  }
  chart.value.setOption(buildOption(), true);
}

function handleResize() {
  chart.value?.resize();
  renderChart();
}

onMounted(() => {
  renderChart();
  if (host.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(host.value);
  }
  window.addEventListener("resize", handleResize);
  if (typeof MutationObserver !== "undefined") {
    themeObserver = new MutationObserver(() => renderChart());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  window.removeEventListener("resize", handleResize);
  chart.value?.dispose();
  chart.value = null;
});

watch(
  () => [props.points, props.mode, props.compact, props.timeZone] as const,
  () => renderChart(),
  { deep: true }
);
</script>

<template>
  <div
    class="responsive-trend-chart"
    :class="{ compact }"
    role="img"
    :aria-label="ariaLabel"
  >
    <div ref="host" class="chart-host"></div>
  </div>
</template>

<style scoped>
.responsive-trend-chart {
  min-width: 0;
  width: 100%;
}
.chart-host {
  width: 100%;
  height: 240px;
  min-height: 160px;
}
.compact .chart-host {
  height: 180px;
}
@media (max-width: 560px) {
  .chart-host {
    height: 200px;
  }
  .compact .chart-host {
    height: 160px;
  }
}
</style>
