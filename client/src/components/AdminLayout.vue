<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import UserPreferencesMenu from "./UserPreferencesMenu.vue";
import AdminSidebar from "./AdminSidebar.vue";

type AdminSection = "dashboard" | "settings" | "system-settings" | "monitor" | "workflow";

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
      <main class="admin-content">
        <slot></slot>
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  --sidebar-width: 258px;
  display: flex;
  width: 100%;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
}
.admin-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.admin-topbar {
  position: relative;
  z-index: 30;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 88px;
  padding: 15px clamp(20px, 3vw, 42px);
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 91%, transparent);
  backdrop-filter: blur(16px);
}
.topbar-title {
  min-width: 0;
}
.topbar-kicker {
  display: block;
  margin-bottom: 4px;
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
}
.topbar-title h1 {
  margin: 0;
  color: var(--text);
  font-size: 21px;
  line-height: 1.2;
  letter-spacing: -0.035em;
  font-weight: 800;
}
.topbar-title p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}
.topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}
.admin-topbar :deep(.dash-button.dash-button),
.admin-topbar :deep(.monitor-button.monitor-button) {
  min-height: 38px;
  padding-right: 13px;
  padding-left: 13px;
  font-size: 12px;
}
.admin-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  --radius: 12px;
  --admin-panel-padding: 20px;
  --admin-section-gap: 20px;
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
  padding: 25px clamp(20px, 3vw, 42px) 40px;
}

/* 管理区共享尺寸规范：三个工作页面共用同一组卡片、指标、标题和控件比例。 */
.admin-content :deep(.card.card),
.admin-content :deep(.dashboard-panel.dashboard-panel),
.admin-content :deep(.monitor-panel.monitor-panel) {
  padding: var(--admin-panel-padding);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.admin-content :deep(.stack.stack) {
  gap: var(--admin-section-gap);
}
.admin-content :deep(.dashboard-panel.dashboard-panel) {
  margin-bottom: 0;
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
  gap: 12px;
  margin-bottom: 20px;
}
.admin-content :deep(.overview-metric.overview-metric),
.admin-content :deep(.metric-card.metric-card) {
  gap: 7px;
  padding: 16px;
  border-radius: 12px;
}
.admin-content :deep(.metric-label.metric-label) {
  font-size: 12px;
  line-height: 1.45;
}
.admin-content :deep(.metric-value.metric-value) {
  font-size: clamp(22px, 2.1vw, 28px);
  line-height: 1.2;
}
.admin-content :deep(.metric-note.metric-note) {
  min-height: 0;
  font-size: 11px;
  line-height: 1.5;
}
.admin-content :deep(.panel-header h3),
.admin-content :deep(.panel-heading h2) {
  font-size: 15px;
  line-height: 1.35;
}
.admin-content :deep(.panel-header p),
.admin-content :deep(.panel-heading p) {
  font-size: 11px;
  line-height: 1.55;
}
.admin-content :deep(.config-detail > span) {
  font-size: 11px;
}
.admin-content :deep(.config-detail strong),
.admin-content :deep(.config-detail code) {
  font-size: 12px;
}
.admin-content :deep(.recent-table),
.admin-content :deep(.table-wrap table) {
  min-width: 560px;
  font-size: 12px;
}
.admin-content :deep(.recent-table th),
.admin-content :deep(.recent-table td),
.admin-content :deep(.table-wrap th),
.admin-content :deep(.table-wrap td) {
  padding: 10px 12px;
}
.admin-content :deep(.dash-button.dash-button),
.admin-content :deep(.monitor-button.monitor-button) {
  min-height: 40px;
  padding-right: 14px;
  padding-left: 14px;
  font-size: 12px;
}
.admin-content :deep(.btn.btn) {
  min-height: 40px;
  font-size: 13px;
}
.admin-content :deep(.chip.chip) {
  min-height: 36px;
}
.admin-content :deep(.webhook-test-button.webhook-test-button) {
  min-height: 34px;
}

.mobile-menu-toggle {
  display: none;
}
.sidebar-backdrop {
  display: none;
}
@media (max-width: 1050px) {
  .admin-layout {
    --sidebar-width: 238px;
  }
  .admin-topbar {
    gap: 16px;
  }
  .admin-topbar :deep(.monitor-top-updated) {
    display: none;
  }
  .admin-content {
    padding-right: 24px;
    padding-left: 24px;
  }
}
@media (max-width: 900px) {
  .sidebar-backdrop {
    display: block;
    position: fixed;
    z-index: 45;
    inset: 0;
    border: 0;
    background: rgba(12, 18, 30, 0.45);
  }
  .admin-topbar {
    min-height: 72px;
    padding: 12px 18px;
    gap: 10px;
  }
  .mobile-menu-toggle {
    display: grid;
    place-items: center;
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .mobile-menu-toggle svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .topbar-title {
    flex: 1;
  }
  .topbar-title h1 {
    font-size: 18px;
  }
  .admin-content {
    padding: 20px 18px 32px;
  }
}
@media (max-width: 620px) {
  .admin-topbar {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 5px 10px;
    align-items: center;
    min-height: 0;
    padding: 10px 16px 10px 13px;
  }
  .mobile-menu-toggle {
    grid-column: 1;
    grid-row: 1;
    width: 32px;
    height: 32px;
  }
  .topbar-title {
    grid-column: 2;
    grid-row: 1;
  }
  .topbar-kicker,
  .topbar-title p {
    display: none;
  }
  .topbar-title h1 {
    font-size: 16px;
    line-height: 1.25;
  }
  .topbar-actions {
    grid-column: 3;
    grid-row: 1;
    width: auto;
    gap: 0;
    flex-wrap: nowrap;
    justify-content: flex-end;
    justify-self: end;
    padding-left: 2px;
  }
  .topbar-actions :deep(.monitor-top-updated) {
    display: none;
  }
  .topbar-actions :deep(.dash-button.dash-button),
  .topbar-actions :deep(.monitor-button.monitor-button) {
    min-height: 36px;
    padding: 0 9px;
    border-radius: 8px;
    font-size: 11px;
  }
  .admin-content {
    --admin-panel-padding: 14px;
    --admin-section-gap: 16px;
    padding: 16px 16px 28px;
  }
  .admin-content :deep(.overview-metrics),
  .admin-content :deep(.metric-grid) {
    gap: 10px;
    margin-bottom: 18px;
  }
  .admin-content :deep(.overview-metric.overview-metric),
  .admin-content :deep(.metric-card.metric-card) {
    padding: 13px 12px;
  }
  .admin-content :deep(.metric-value.metric-value) {
    font-size: 22px;
  }
  .admin-content :deep(.admin-page input:not([type="checkbox"]):not([type="radio"])),
  .admin-content :deep(.admin-page select),
  .admin-content :deep(.admin-page textarea:not(.CodeMirror)) {
    min-height: 44px;
    font-size: 16px;
  }
}
@media (max-width: 360px) {
  .admin-topbar {
    padding-right: 10px;
    padding-left: 10px;
  }
  .topbar-actions :deep(.dash-button),
  .topbar-actions :deep(.monitor-button) {
    padding: 0 7px;
    font-size: 9px;
  }
}
</style>
