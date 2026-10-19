<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "./AppIcon.vue";
import ThemeSwitcher from "./ThemeSwitcher.vue";

type AdminSection = "dashboard" | "settings" | "monitor";

defineProps<{
  active: AdminSection;
  title: string;
  subtitle: string;
}>();

const route = useRoute();
const menuOpen = ref(false);

watch(() => route.fullPath, () => {
  menuOpen.value = false;
});
</script>

<template>
  <div class="admin-layout">
    <button
      v-if="menuOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航菜单"
      @click="menuOpen = false"
    ></button>

    <aside class="admin-sidebar" :class="{ 'is-open': menuOpen }">
      <RouterLink to="/admin/dashboard" class="sidebar-brand" aria-label="进入管理总览">
        <span class="brand-mark" aria-hidden="true"><AppIcon name="network" :size="20" :stroke-width="1.8" /></span>
        <span class="brand-copy">
          <strong>genpac-runner</strong>
          <small>管理控制台</small>
        </span>
      </RouterLink>

      <nav class="sidebar-nav" aria-label="管理导航">
        <section class="nav-group" aria-labelledby="nav-workbench">
          <p id="nav-workbench" class="nav-caption">工作台</p>
          <RouterLink
            to="/admin/dashboard"
            class="sidebar-link"
            :class="{ active: active === 'dashboard' }"
            :aria-current="active === 'dashboard' ? 'page' : undefined"
          >
            <AppIcon name="layout-dashboard" :size="18" />
            <span>系统总览</span>
          </RouterLink>
          <RouterLink
            to="/admin/monitor"
            class="sidebar-link"
            :class="{ active: active === 'monitor' }"
            :aria-current="active === 'monitor' ? 'page' : undefined"
          >
            <AppIcon name="activity" :size="18" />
            <span>网络监控</span>
          </RouterLink>
        </section>

        <section class="nav-group" aria-labelledby="nav-configuration">
          <p id="nav-configuration" class="nav-caption">配置</p>
          <RouterLink
            to="/admin"
            class="sidebar-link"
            :class="{ active: active === 'settings' }"
            :aria-current="active === 'settings' ? 'page' : undefined"
          >
            <AppIcon name="settings" :size="18" />
            <span>配置管理</span>
          </RouterLink>
        </section>

        <section class="nav-group" aria-labelledby="nav-services">
          <p id="nav-services" class="nav-caption">服务入口</p>
          <RouterLink to="/" class="sidebar-link">
            <AppIcon name="globe" :size="18" />
            <span>公共状态页</span>
          </RouterLink>
          <a class="sidebar-link" href="/proxy.pac" target="_blank" rel="noopener noreferrer">
            <AppIcon name="file-text" :size="18" />
            <span>PAC 文件</span><AppIcon class="external-mark" name="arrow-up-right" :size="14" />
          </a>
        </section>
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-status"><span class="status-dot"></span><span>管理服务已连接</span></div>
        <span class="sidebar-note">设置保存于本地 SQLite 数据库</span>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <button class="mobile-menu-toggle" type="button" :aria-expanded="menuOpen" aria-label="切换导航菜单" @click="menuOpen = !menuOpen">
          <AppIcon name="menu" :size="18" />
        </button>
        <div class="topbar-title">
          <span class="topbar-kicker">管理控制台</span>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
        <div class="topbar-actions">
          <slot name="actions"></slot>
          <ThemeSwitcher />
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
  min-height: 100vh;
  color: var(--text);
  background: var(--bg);
}
.admin-sidebar {
  position: fixed;
  z-index: 50;
  inset: 0 auto 0 0;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  padding: 22px 14px 16px;
  border-right: 1px solid var(--line);
  background: var(--surface);
}
.sidebar-brand { display:flex; align-items:center; gap:11px; margin:0 8px 26px; color:var(--text); text-decoration:none; }
.brand-mark { display:grid; place-items:center; flex:0 0 40px; width:40px; height:40px; border:1px solid color-mix(in srgb,var(--accent) 23%,var(--line)); border-radius:13px; color:var(--accent); background:var(--accent-soft); box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 3px 9px color-mix(in srgb,var(--accent) 8%,transparent); }
.brand-copy { min-width:0; }
.brand-copy strong { display:block; font-size:14px; font-weight:800; letter-spacing:-.035em; }
.brand-copy small { display:block; margin-top:3px; color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.12em; }
.sidebar-nav { flex:1; min-height:0; overflow-y:auto; padding:0 2px 10px; }
.nav-group + .nav-group { margin-top:20px; padding-top:17px; border-top:1px solid var(--line); }
.nav-caption { margin:0 10px 7px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.13em; }
.sidebar-link { display:flex; align-items:center; gap:12px; min-height:42px; margin:3px 0; padding:0 11px; border:1px solid transparent; border-radius:10px; color:var(--muted); text-decoration:none; font-size:12px; font-weight:650; transition:background .15s,border-color .15s,color .15s; }
.sidebar-link :deep(.app-icon) { flex:0 0 18px; }
.sidebar-link:hover { color:var(--text); background:var(--surface-2); text-decoration:none; }
.sidebar-link.active { color:var(--accent); background:var(--accent-soft); border-color:color-mix(in srgb,var(--accent) 22%,var(--line)); box-shadow:inset 3px 0 0 var(--accent); }
.external-mark { margin-left:auto; opacity:.65; font-size:13px; }
.sidebar-bottom { padding:14px 10px 0; border-top:1px solid var(--line); }
.sidebar-status { display:flex; align-items:center; gap:8px; color:var(--text); font-size:11px; font-weight:700; }
.status-dot { width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 0 3px var(--green-soft); }
.sidebar-note { display:block; margin-top:7px; color:var(--muted); font-size:10px; line-height:1.5; }
.admin-main { min-height:100vh; margin-left:var(--sidebar-width); min-width:0; }
.admin-topbar { position:sticky; z-index:30; top:0; display:flex; align-items:center; justify-content:space-between; gap:24px; min-height:88px; padding:15px clamp(20px,3vw,42px); border-bottom:1px solid var(--line); background:color-mix(in srgb,var(--bg) 91%,transparent); backdrop-filter:blur(16px); }
.topbar-title { min-width:0; }
.topbar-kicker { display:block; margin-bottom:4px; color:var(--accent); font-size:9px; font-weight:800; letter-spacing:.15em; }
.topbar-title h1 { margin:0; color:var(--text); font-size:21px; line-height:1.2; letter-spacing:-.035em; font-weight:800; }
.topbar-title p { margin:5px 0 0; color:var(--muted); font-size:11px; line-height:1.45; }
.topbar-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex:0 0 auto; min-width:0; }
.admin-topbar :deep(.dash-button.dash-button),
.admin-topbar :deep(.monitor-button.monitor-button),
.admin-topbar :deep(.admin-logout-button.admin-logout-button) {
  min-height: 38px;
  padding-right: 13px;
  padding-left: 13px;
  font-size: 12px;
}
.admin-content {
  --radius: 12px;
  --admin-panel-padding: 20px;
  --admin-section-gap: 20px;
  width:100%;
  max-width:1680px;
  margin:0 auto;
  padding:25px clamp(20px,3vw,42px) 40px;
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
.admin-content :deep(.monitor-button.monitor-button),
.admin-content :deep(.admin-logout-button.admin-logout-button) {
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

.mobile-menu-toggle { display:none; }
.sidebar-backdrop { display:none; }
@media (max-width:1050px) { .admin-layout { --sidebar-width:238px; } .admin-topbar { gap:16px; } .admin-topbar :deep(.monitor-top-updated) { display:none; } .admin-content { padding-right:24px; padding-left:24px; } }
@media (max-width:900px) {
  .admin-sidebar { box-shadow:none; transform:translateX(-102%); transition:transform .2s ease,box-shadow .2s ease; }
  .admin-sidebar.is-open { transform:translateX(0); box-shadow:18px 0 48px rgba(10,20,35,.18); }
  .sidebar-backdrop { display:block; position:fixed; z-index:45; inset:0; border:0; background:rgba(12,18,30,.45); }
  .admin-main { margin-left:0; }
  .admin-topbar { min-height:72px; padding:12px 18px; gap:10px; }
  .mobile-menu-toggle { display:grid; place-items:center; flex:0 0 36px; width:36px; height:36px; padding:0; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--text); cursor:pointer; }
  .mobile-menu-toggle svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
  .topbar-title { flex:1; }
  .topbar-title h1 { font-size:18px; }
  .admin-content { padding:20px 18px 32px; }
}
@media (max-width:620px) {
  .admin-topbar { display:grid; grid-template-columns:32px minmax(0,1fr); gap:5px 10px; align-items:center; min-height:0; padding:9px 13px; }
  .mobile-menu-toggle { grid-column:1; grid-row:1; width:32px; height:32px; }
  .topbar-title { grid-column:2; grid-row:1; }
  .topbar-kicker,.topbar-title p { display:none; }
  .topbar-title h1 { font-size:16px; line-height:1.25; }
  .topbar-actions { grid-column:1 / -1; grid-row:2; width:100%; gap:5px; flex-wrap:nowrap; justify-content:flex-end; }
  .topbar-actions :deep(.monitor-top-updated) { display:none; }
  .topbar-actions :deep(.dash-button.dash-button),.topbar-actions :deep(.monitor-button.monitor-button),.topbar-actions :deep(.admin-logout-button.admin-logout-button) { min-height:36px; padding:0 9px; border-radius:8px; font-size:11px; }
  .topbar-actions :deep(.theme-switch) { gap:0; padding:2px; border-radius:8px; }
  .topbar-actions :deep(.theme-btn) { min-height:30px; padding:0 6px; font-size:10px; }
  .admin-content { --admin-panel-padding:14px; --admin-section-gap:16px; padding:16px 16px 28px; }
  .admin-content :deep(.overview-metrics),.admin-content :deep(.metric-grid) { gap:10px; margin-bottom:18px; }
  .admin-content :deep(.overview-metric.overview-metric),.admin-content :deep(.metric-card.metric-card) { padding:13px 12px; }
  .admin-content :deep(.metric-value.metric-value) { font-size:22px; }
  .admin-content :deep(.admin-page input:not([type="checkbox"]):not([type="radio"])),
  .admin-content :deep(.admin-page select),
  .admin-content :deep(.admin-page textarea:not(.CodeMirror)) { min-height:44px; font-size:16px; }
  .admin-content { padding:16px; }
}
@media (max-width:360px) {
  .admin-topbar { padding-right:10px; padding-left:10px; }
  .topbar-actions :deep(.dash-button),.topbar-actions :deep(.monitor-button) { padding:0 7px; font-size:9px; }
  .topbar-actions :deep(.theme-btn) { padding:0 5px; }
}
</style>