<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { EChartsType } from "echarts/core";
const { t, locale } = useI18n();

type EChartsModule = typeof import("@/lib/echarts");

let echartsLoading: Promise<EChartsModule> | undefined;

/** Load only the registered chart modules when a chart is actually rendered. */
function loadEcharts(): Promise<EChartsModule> {
  if (!echartsLoading) {
    echartsLoading = import("@/lib/echarts").catch((error: unknown) => {
      echartsLoading = undefined;
      throw error;
    });
  }
  return echartsLoading;
}

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
    ariaLabel: "",
    compact: false,
    mode: "count",
  }
);

const resolvedAriaLabel = computed(() => props.ariaLabel || t("chart.trend24h"));
const host = ref<HTMLElement | null>(null);
const chart = shallowRef<EChartsType | null>(null);
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let mobileMediaQuery: MediaQueryList | undefined;
let resizeFrame = 0;

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
    const r = c[1],
      g = c[2],
      b = c[3];
    return "#" + r + r + g + g + b + b + alpha;
  }
  return c;
}

function formatHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  try {
    return new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", {
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
    return new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", {
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
    outerBoundsMode: "same",
    outerBoundsContain: "axisLabel",
  };

  const tooltip = {
    trigger: "axis" as const,
    confine: true,
    backgroundColor: surface,
    borderColor: line,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: text, fontSize: 12, fontFamily: "var(--font)" },
    extraCssText: "box-shadow:var(--shadow);border-radius:10px;",
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
            '">' +
            t("chart.avgResponse") +
            "</div>" +
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
          formatter: (value: number) => formatDuration(value),
        },
        splitLine: { lineStyle: { color: line, type: "dashed" } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: t("chart.avgResponse"),
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
      data: [t("chart.request"), t("chart.error")],
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
            const label =
              item.seriesName === t("chart.error")
                ? t("chart.errorRequest")
                : t("chart.totalRequests");
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
        name: t("chart.request"),
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
        name: t("chart.error"),
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

  void loadEcharts()
    .then(({ init }) => {
      const element = host.value;
      if (!element || !props.points?.length) return;
      if (!chart.value) {
        chart.value = init(element, undefined, { renderer: "canvas" });
      }
      chart.value.setOption(buildOption(), true);
    })
    .catch((error: unknown) => {
      console.error("[ResponsiveTrendChart] Failed to load ECharts modules.", error);
    });
}

function scheduleChartResize() {
  if (resizeFrame) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    chart.value?.resize();
  });
}

function onBreakpointChange() {
  // Chart options differ at the mobile breakpoint; ordinary resizes only need canvas resizing.
  renderChart();
}

onMounted(() => {
  renderChart();
  if (host.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleChartResize);
    resizeObserver.observe(host.value);
  }
  if (typeof window !== "undefined") {
    mobileMediaQuery = window.matchMedia("(max-width: 560px)");
    mobileMediaQuery.addEventListener("change", onBreakpointChange);
  }
  if (typeof MutationObserver !== "undefined") {
    themeObserver = new MutationObserver(() => renderChart());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  mobileMediaQuery?.removeEventListener("change", onBreakpointChange);
  if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
  resizeFrame = 0;
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
    :aria-label="resolvedAriaLabel"
  >
    <div ref="host" class="chart-host"></div>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.responsive-trend-chart {
  @apply w-full min-w-0;
}
.chart-host {
  @apply h-[240px] min-h-[160px] w-full;
}
.compact .chart-host {
  @apply h-[180px];
}
@media (max-width: 560px) {
  .chart-host {
    @apply h-[200px];
  }
  .compact .chart-host {
    @apply h-[160px];
  }
}
</style>
