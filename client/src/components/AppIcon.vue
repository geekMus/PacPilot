<script setup lang="ts">
import { computed } from "vue";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  CircleAlert,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCheck,
  FileCog,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Network,
  RefreshCw,
  Route,
  Save,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Timer,
  Workflow,
  Wrench,
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
  "chart": ChartNoAxesCombined,
  check: Check,
  "circle-alert": CircleAlert,
  "chevron-down": ChevronDown,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
  "circle-check": CircleCheck,
  "circle-help": CircleHelp,
  "circle-x": CircleX,
  clock: Clock,
  "code-2": Code2,
  copy: Copy,
  database: Database,
  "external-link": ExternalLink,
  "file-check": FileCheck,
  "file-cog": FileCog,
  "file-text": FileText,
  gauge: Gauge,
  globe: Globe,
  "hard-drive": HardDrive,
  info: Info,
  "key-round": KeyRound,
  "layout-dashboard": LayoutDashboard,
  "list-checks": ListChecks,
  "list-filter": ListFilter,
  "loader-circle": LoaderCircle,
  "lock-keyhole": LockKeyhole,
  "log-out": LogOut,
  menu: Menu,
  monitor: Monitor,
  moon: Moon,
  network: Network,
  "refresh-cw": RefreshCw,
  route: Route,
  save: Save,
  search: Search,
  server: Server,
  settings: Settings2,
  "shield-check": ShieldCheck,
  "sliders-horizontal": SlidersHorizontal,
  sun: Sun,
  timer: Timer,
  workflow: Workflow,
  wrench: Wrench,
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
