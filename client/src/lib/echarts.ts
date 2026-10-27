/**
 * Centralized, tree-shakeable ECharts registration.
 *
 * Keep named imports here so the bundler can eliminate unused charts/components.
 * `init`/`use` are named bindings rather than a namespace object: re-exporting the
 * whole `echarts/core` namespace defeats tree-shaking of the core API surface (zrender,
 * matrix/vector/color helpers, geo parsing, Model/Axis/List) that this app never calls.
 * This module is loaded dynamically by ResponsiveTrendChart only when a chart is rendered.
 */
import { init, use } from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

export { init };
