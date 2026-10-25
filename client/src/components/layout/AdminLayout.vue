<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import AppIcon from "@/components/AppIcon.vue";
import UserPreferencesMenu from "@/components/UserPreferencesMenu.vue";
import AdminSidebar from "@/components/layout/AdminSidebar.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";

type AdminSection =
  "dashboard" | "settings" | "system-settings" | "monitor" | "workflow" | "logs" | "notifications";

defineProps<{
  active: AdminSection;
  title: string;
  subtitle: string;
}>();

const { t } = useI18n();
const route = useRoute();
const menuOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  }
);
</script>

<template>
  <div class="admin-layout">
    <button
      v-if="menuOpen"
      class="sidebar-backdrop"
      type="button"
      :aria-label="t('layout.closeNav')"
      @click="menuOpen = false"
    ></button>

    <AdminSidebar :active="active" :open="menuOpen" />

    <div class="admin-main">
      <AppScrollArea root-class="admin-content" orientation="vertical">
        <div
          class="admin-content-inner"
          :class="{ 'admin-content-inner--notifications': active === 'notifications' }"
        >
          <slot></slot>
        </div>
      </AppScrollArea>
      <header class="admin-topbar">
        <button
          class="mobile-menu-toggle"
          type="button"
          :aria-expanded="menuOpen"
          :aria-label="t('layout.toggleNav')"
          @click="menuOpen = !menuOpen"
        >
          <AppIcon name="menu" :size="18" />
        </button>
        <div class="topbar-title">
          <span class="topbar-kicker">{{ t("layout.adminConsole") }}</span>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
        <div class="topbar-actions">
          <slot name="actions"></slot>
          <UserPreferencesMenu />
        </div>
      </header>
    </div>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.admin-layout {
  @apply flex h-dvh w-full min-h-0 overflow-hidden;
  --sidebar-width: 258px;
  --admin-topbar-space: 104px;
  color: var(--text);
  background: var(--bg);
}
.admin-main {
  @apply relative flex h-full min-w-0 min-h-0 flex-col;
  flex: 1 1 auto;
}
.admin-topbar {
  @apply absolute inset-x-0 top-0 z-30 flex min-h-[88px] items-center justify-between gap-6 px-[clamp(20px,3vw,42px)] py-[15px];
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  background: color-mix(in srgb, var(--bg) 58%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  backdrop-filter: saturate(180%) blur(24px);
}
.topbar-title {
  @apply min-w-0;
}
.topbar-kicker {
  @apply mb-1 block text-[9px] font-extrabold tracking-[0.15em];
  color: var(--accent);
}
.topbar-title h1 {
  @apply m-0 text-[21px] font-extrabold leading-tight tracking-[-0.035em];
  color: var(--text);
}
.topbar-title p {
  @apply mb-0 mt-[5px] text-[11px] leading-snug;
  color: var(--muted);
}
.topbar-actions {
  @apply flex min-w-0 shrink-0 items-center justify-end gap-2;
}
.admin-topbar :deep(.app-button.app-button) {
  @apply min-h-[38px] px-[13px] text-xs;
}
.admin-content {
  @apply absolute inset-0 w-full min-h-0;
  /* Let the absolute insets determine the scroll area's height. Combining
     top/bottom insets with height: 100% over-constrains this positioned
     element and can make the shared admin viewport collapse in some layouts. */
  --radius: 12px;
  --admin-panel-padding: 20px;
  --admin-section-gap: 20px;
}

/* The notifications page owns a sticky workspace that must be able to travel
   inside its own page box. The wrapper therefore provides a full height floor
   but must not clamp the page to the viewport height. */
.admin-content-inner--notifications {
  @apply flex flex-col min-h-full;
}
.admin-content-inner--notifications > :deep(.webhook-page) {
  @apply min-h-0;
  flex: 0 0 auto;
}
.admin-content-inner {
  @apply mx-auto box-border w-full max-w-[1680px] min-h-full;
  padding: calc(var(--admin-topbar-space) + 25px) clamp(20px, 3vw, 42px) 40px;
}

/* 管理区共享尺寸规范：三个工作页面共用同一组卡片、指标、标题和控件比例。 */
.admin-content :deep(.card.card),
.admin-content :deep(.dashboard-panel.dashboard-panel),
.admin-content :deep(.monitor-panel.monitor-panel) {
  @apply rounded-xl p-[var(--admin-panel-padding)];
  box-shadow: var(--shadow);
}
.admin-content :deep(.stack.stack) {
  gap: var(--admin-section-gap);
}
.admin-content :deep(.dashboard-panel.dashboard-panel) {
  @apply mb-0;
}
.admin-content :deep(.monitor-panel.monitor-panel) {
  margin-bottom: var(--admin-section-gap);
}
.admin-content :deep(.overview-grid),
.admin-content :deep(.activity-panel.activity-panel) {
  margin-bottom: var(--admin-section-gap);
}
.admin-content :deep(.overview-metrics),
.admin-content :deep(.metric-grid) {
  @apply mb-5 gap-3;
}
.admin-content :deep(.overview-metric.overview-metric),
.admin-content :deep(.metric-card.metric-card) {
  @apply gap-[7px] rounded-xl p-4;
}
.admin-content :deep(.metric-label.metric-label) {
  @apply text-xs leading-snug;
}
.admin-content :deep(.metric-value.metric-value) {
  @apply leading-tight;
  font-size: clamp(22px, 2.1vw, 28px);
}
.admin-content :deep(.metric-note.metric-note) {
  @apply min-h-0 text-[11px] leading-normal;
}
.admin-content :deep(.panel-header h3),
.admin-content :deep(.panel-heading h2) {
  @apply text-[15px] leading-snug;
}
.admin-content :deep(.panel-header p),
.admin-content :deep(.panel-heading p) {
  @apply text-[11px] leading-normal;
}
.admin-content :deep(.config-detail > span) {
  @apply text-[11px];
}
.admin-content :deep(.config-detail strong),
.admin-content :deep(.config-detail code) {
  @apply text-xs;
}
.admin-content :deep(.recent-table),
.admin-content :deep(.table-wrap table) {
  @apply text-xs;
  min-width: 560px;
}
.admin-content :deep(.recent-table th),
.admin-content :deep(.recent-table td),
.admin-content :deep(.table-wrap th),
.admin-content :deep(.table-wrap td) {
  @apply px-3 py-2.5;
}
.admin-content :deep(.app-button.app-button) {
  @apply min-h-10 px-[14px] text-xs;
}
.admin-content :deep(.chip.chip) {
  @apply min-h-9;
}
.mobile-menu-toggle {
  @apply hidden;
}
.sidebar-backdrop {
  @apply hidden;
}
@media (max-width: 1050px) {
  .admin-layout {
    --sidebar-width: 238px;
  }
  .admin-topbar {
    @apply gap-4;
  }
  .admin-topbar :deep(.monitor-top-updated) {
    @apply hidden;
  }
  .admin-content-inner {
    @apply px-6;
  }
}
@media (max-width: 900px) {
  .admin-layout {
    --admin-topbar-space: 92px;
  }
  .sidebar-backdrop {
    @apply fixed inset-0 z-[45] block border-0;
    background: rgba(12, 18, 30, 0.45);
  }
  .admin-topbar {
    @apply min-h-[72px] gap-2.5 px-[18px] py-3;
  }
  .mobile-menu-toggle {
    @apply grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[9px] border p-0;
    flex: 0 0 36px;
    border-color: var(--line);
    background: var(--surface);
    color: var(--text);
  }
  .mobile-menu-toggle svg {
    @apply h-[18px] w-[18px];
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .topbar-title {
    @apply flex-1;
  }
  .topbar-title h1 {
    @apply text-lg;
  }
  .admin-content-inner {
    @apply px-[18px] pt-5 pb-8;
  }
}
@media (max-width: 620px) {
  .admin-layout {
    --admin-topbar-space: 64px;
  }
  .admin-topbar {
    @apply grid min-h-0 items-center gap-x-2.5 gap-y-[5px] py-2.5 pl-[13px] pr-4;
    grid-template-columns: 32px minmax(0, 1fr) auto;
  }
  .mobile-menu-toggle {
    @apply col-start-1 row-start-1 h-8 w-8;
  }
  .topbar-title {
    @apply col-start-2 row-start-1;
  }
  .topbar-kicker,
  .topbar-title p {
    @apply hidden;
  }
  .topbar-title h1 {
    @apply text-base leading-tight;
  }
  .topbar-actions {
    @apply col-start-3 row-start-1 w-auto flex-nowrap justify-end justify-self-end gap-0 pl-0.5;
  }
  .topbar-actions :deep(.monitor-top-updated) {
    @apply hidden;
  }
  .topbar-actions :deep(.app-button.app-button) {
    @apply min-h-9 rounded-lg px-[9px] text-[11px];
  }
  .admin-content {
    --admin-panel-padding: 14px;
    --admin-section-gap: 16px;
  }
  .admin-content-inner {
    @apply px-4 pt-4 pb-7;
  }
  .admin-content :deep(.overview-metrics),
  .admin-content :deep(.metric-grid) {
    @apply mb-[18px] gap-2.5;
  }
  .admin-content :deep(.overview-metric.overview-metric),
  .admin-content :deep(.metric-card.metric-card) {
    @apply px-3 py-[13px];
  }
  .admin-content :deep(.metric-value.metric-value) {
    @apply text-[22px];
  }
  .admin-content :deep(.admin-page input:not([type="checkbox"]):not([type="radio"])),
  .admin-content :deep(.admin-page select),
  .admin-content :deep(.admin-page textarea:not(.CodeMirror)) {
    @apply min-h-11 text-base;
  }
}
@media (max-width: 360px) {
  .admin-topbar {
    @apply px-2.5;
  }
  .topbar-actions :deep(.app-button) {
    @apply px-[7px] text-[9px];
  }
}
</style>
