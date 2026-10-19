<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileCog,
  FileText,
  Gauge,
  Globe,
  Info,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  RefreshCw,
  Route,
  Save,
  Settings2,
  ShieldCheck,
  Timer,
  Workflow,
  X,
  Zap,
} from "@lucide/vue";

const props = withDefaults(defineProps<{
  name: string;
  size?: number;
  strokeWidth?: number;
}>(), {
  size: 18,
  strokeWidth: 1.9,
});

const iconMap = {
  activity: Activity,
  "alert-triangle": AlertTriangle,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  "calendar-clock": CalendarClock,
  chart: ChartNoAxesCombined,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  "chevron-down": ChevronDown,
  clock: Clock,
  copy: Copy,
  download: Download,
  "external-link": ExternalLink,
  "file-check": FileCheck,
  "file-cog": FileCog,
  "file-text": FileText,
  gauge: Gauge,
  globe: Globe,
  info: Info,
  "layout-dashboard": LayoutDashboard,
  "list-checks": ListChecks,
  "loader-circle": LoaderCircle,
  "lock-keyhole": LockKeyhole,
  "log-out": LogOut,
  menu: Menu,
  network: Network,
  "refresh-cw": RefreshCw,
  route: Route,
  save: Save,
  settings: Settings2,
  "shield-check": ShieldCheck,
  timer: Timer,
  workflow: Workflow,
  x: X,
  zap: Zap,
} as const;

const selectedIcon = computed(() => {
  return iconMap[props.name as keyof typeof iconMap] ?? CircleHelp;
});
</script>

<template>
  <component
    :is="selectedIcon"
    class="app-icon"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>

<style scoped>
.app-icon {
  display: inline-block;
  flex: 0 0 auto;
  vertical-align: middle;
}
</style>
