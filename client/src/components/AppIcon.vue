<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  Circle,
  CircleAlert,
  CheckCircle2,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  ChevronDown,
  Copy,
  Download,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck,
  FileCog,
  FileText,
  Gauge,
  Globe,
  Info,
  LayoutDashboard,
  KeyRound,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Trash2,
  Workflow,
  X,
  Zap,
} from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 18,
    strokeWidth: 1.9,
  }
);

const iconMap = {
  activity: Activity,
  "alert-triangle": AlertTriangle,
  "triangle-alert": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  "calendar-clock": CalendarClock,
  chart: ChartNoAxesCombined,
  "circle-alert": CircleAlert,
  circle: Circle,
  check: Check,
  "circle-check": CircleCheck,
  "circle-help": CircleHelp,
  "check-circle-2": CheckCircle2,
  "check-circle": CircleCheck,
  "circle-x": CircleX,
  "chevron-down": ChevronDown,
  clock: Clock,
  copy: Copy,
  database: Database,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  "external-link": ExternalLink,
  "file-check": FileCheck,
  "file-check-2": FileCheck,
  "file-cog": FileCog,
  "file-text": FileText,
  gauge: Gauge,
  globe: Globe,
  info: Info,
  "layout-dashboard": LayoutDashboard,
  "key-round": KeyRound,
  key: KeyRound,
  "list-checks": ListChecks,
  "loader-circle": LoaderCircle,
  "lock-keyhole": LockKeyhole,
  "log-out": LogOut,
  menu: Menu,
  network: Network,
  "refresh-cw": RefreshCw,
  route: Route,
  "rotate-ccw": RotateCcw,
  save: Save,
  settings: Settings2,
  "settings-2": Settings2,
  "sliders-horizontal": SlidersHorizontal,
  "shield-check": ShieldCheck,
  timer: Timer,
  "trash-2": Trash2,
  workflow: Workflow,
  x: X,
  zap: Zap,
} as const;

const selectedIcon = computed(() => {
  const icon = iconMap[props.name as keyof typeof iconMap];
  if (!icon && import.meta.env.DEV) {
    console.warn(`[AppIcon] 未注册的图标名称："${props.name}"`);
  }
  return icon ?? CircleHelp;
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
