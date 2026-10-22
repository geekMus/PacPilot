/**
 * Centralized, tree-shakeable ECharts registration.
 *
 * Keep named imports here so the bundler can eliminate unused charts/components.
 * This module is loaded dynamically by ResponsiveTrendChart only when a chart is rendered.
 */
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

export { echarts };
