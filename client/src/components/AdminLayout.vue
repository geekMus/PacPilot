<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api/client";
import { fetchAdminSession, invalidateAdminSessionCache } from "../composables/useAdminSession";
import { useToast } from "../composables/useToast";
import AppIcon from "./AppIcon.vue";
import { useI18n } from "vue-i18n";
import BrandMark from "./BrandMark.vue";
import ThemeSwitcher from "./ThemeSwitcher.vue";

type AdminSection = "dashboard" | "settings" | "system-settings" | "monitor" | "workflow";

defineProps<{
  active: AdminSection;
  title: string;
  subtitle: string;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { notify } = useToast();
const menuOpen = ref(false);
const logoutBusy = ref(false);
const mustChangePassword = ref(false);

async function refreshSecurityGate(): Promise<void> {
  try {
    const session = await fetchAdminSession();
    mustChangePassword.value = Boolean(session.loggedIn && session.mustChangePassword);
  } catch {
    mustChangePassword.value = false;
  }
}

function blockedNavTitle(label: string): string {
  return mustChangePassword.value
    ? `请先修改默认管理密码后再访问「${label}」`
    : label;
}

function onBlockedNav(label: string): void {
  if (!mustChangePassword.value) return;
  notify(`请先修改默认管理密码后再访问「${label}」。`, "warning", 4500);
}

async function logout(): Promise<void> {
  if (logoutBusy.value) return;
  logoutBusy.value = true;
  try {
    await api.logout();
    invalidateAdminSessionCache();
  } finally {
    menuOpen.value = false;
    try {
      await router.replace("/admin/login");
    } finally {
      logoutBusy.value = false;
    }
  }
}

onMounted(() => {
  void refreshSecurityGate();
});

watch(() => route.fullPath, () => {
  menuOpen.value = false;
  void refreshSecurityGate();
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
      <div class="sidebar-brand" aria-label="genpac-runner 项目名称">
        <BrandMark :size="40" />
        <span class="brand-copy">
          <strong>genpac-runner</strong>
          <small>{{ t('layout.adminConsole') }}</small>
        </span>
      </div>

      <nav class="sidebar-nav" :aria-label="t('layout.adminConsole')">
        <section class="nav-group" aria-labelledby="nav-workbench">
          <p id="nav-workbench" class="nav-caption">{{ t('layout.workbench') }}</p>
          <p v-if="mustChangePassword" class="nav-lock-note" role="status">{{ t('layout.mustChangePassword') }}</p>
          <RouterLink
            v-if="!mustChangePassword"
            to="/admin/dashboard"
            class="sidebar-link"
            :class="{ active: active === 'dashboard' }"
            :aria-current="active === 'dashboard' ? 'page' : undefined"
          >
            <AppIcon name="layout-dashboard" :size="18" />
            <span>{{ t('nav.dashboard') }}</span>
          </RouterLink>
          <button
            v-else
            type="button"
            class="sidebar-link is-disabled"
            :title="blockedNavTitle(t('nav.dashboard'))"
            aria-disabled="true"
            @click="onBlockedNav(t('nav.dashboard'))"
          >
            <AppIcon name="layout-dashboard" :size="18" />
            <span>{{ t('nav.dashboard') }}</span>
          </button>
          <RouterLink
            v-if="!mustChangePassword"
            to="/admin/monitor"
            class="sidebar-link"
            :class="{ active: active === 'monitor' }"
            :aria-current="active === 'monitor' ? 'page' : undefined"
          >
            <AppIcon name="activity" :size="18" />
            <span>{{ t('nav.monitor') }}</span>
          </RouterLink>
          <button
            v-else
            type="button"
            class="sidebar-link is-disabled"
            :title="blockedNavTitle(t('nav.monitor'))"
            aria-disabled="true"
            @click="onBlockedNav(t('nav.monitor'))"
          >
            <AppIcon name="activity" :size="18" />
            <span>{{ t('nav.monitor') }}</span>
          </button>
          <RouterLink
            to="/admin/settings"
            class="sidebar-link"
            :class="{ active: active === 'settings' }"
            :aria-current="active === 'settings' ? 'page' : undefined"
          >
            <AppIcon name="sliders-horizontal" :size="18" />
            <span>{{ t('nav.settings') }}</span>
          </RouterLink>
          <RouterLink
            v-if="!mustChangePassword"
            to="/admin/workflows"
            class="sidebar-link"
            :class="{ active: active === 'workflow' }"
            :aria-current="active === 'workflow' ? 'page' : undefined"
          >
            <AppIcon name="workflow" :size="18" />
            <span>{{ t('nav.workflow') }}</span>
          </RouterLink>
          <button
            v-else
            type="button"
            class="sidebar-link is-disabled"
            :title="blockedNavTitle(t('nav.workflow'))"
            aria-disabled="true"
            @click="onBlockedNav(t('nav.workflow'))"
          >
            <AppIcon name="workflow" :size="18" />
            <span>{{ t('nav.workflow') }}</span>
          </button>
          <RouterLink
            v-if="!mustChangePassword"
            to="/admin/system-settings"
            class="sidebar-link"
            :class="{ active: active === 'system-settings' }"
            :aria-current="active === 'system-settings' ? 'page' : undefined"
          >
            <AppIcon name="settings-2" :size="18" />
            <span>{{ t('nav.systemSettings') }}</span>
          </RouterLink>
          <button
            v-else
            type="button"
            class="sidebar-link is-disabled"
            :title="blockedNavTitle(t('nav.systemSettings'))"
            aria-disabled="true"
            @click="onBlockedNav(t('nav.systemSettings'))"
          >
            <AppIcon name="settings-2" :size="18" />
            <span>{{ t('nav.systemSettings') }}</span>
          </button>
        </section>

        <section class="nav-group" aria-labelledby="nav-services">
          <p id="nav-services" class="nav-caption">{{ t('nav.services') }}</p>
          <RouterLink to="/" class="sidebar-link">
            <AppIcon name="globe" :size="18" />
            <span>{{ t('nav.publicStatus') }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="sidebar-bottom">
        <div class="sidebar-status"><span class="status-dot"></span><span>管理服务已连接</span></div>
        <span class="sidebar-note">设置保存于本地 SQLite 数据库</span>
        <div class="sidebar-mobile-controls">
          <div class="sidebar-theme-group">
            <span class="sidebar-control-label">外观主题</span>
            <ThemeSwitcher />
          </div>
          <button type="button" class="sidebar-logout-button" :disabled="logoutBusy" :title="logoutBusy ? '正在退出管理员账号，请稍候' : '退出管理员账号'" @click="logout">
            <AppIcon :name="logoutBusy ? 'loader-circle' : 'log-out'" :size="16" :class="{ 'icon-spinning': logoutBusy }" />
            {{ logoutBusy ? '正在退出…' : t('nav.logout') }}
          </button>
        </div>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <button class="mobile-menu-toggle" type="button" :aria-expanded="menuOpen" aria-label="切换导航菜单" @click="menuOpen = !menuOpen">
          <AppIcon name="menu" :size="18" />
        </button>
        <div class="topbar-title">
          <span class="topbar-kicker">{{ t('layout.adminConsole') }}</span>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
        <div class="topbar-actions">
          <slot name="actions"></slot>
          <button type="button" class="admin-logout-button" :disabled="logoutBusy" :title="logoutBusy ? '正在退出管理员账号，请稍候' : '退出管理员账号'" @click="logout">
            <AppIcon :name="logoutBusy ? 'loader-circle' : 'log-out'" :size="15" :class="{ 'icon-spinning': logoutBusy }" />
            {{ logoutBusy ? '正在退出…' : t('nav.logout') }}
          </button>
          <span class="topbar-theme-switcher"><ThemeSwitcher /></span>
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

.brand-copy { min-width:0; }
.brand-copy strong { display:block; font-size:14px; font-weight:800; letter-spacing:-.035em; }
.brand-copy small { display:block; margin-top:3px; color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.12em; }
.sidebar-nav { flex:1; min-height:0; overflow-y:auto; padding:0 2px 10px; }
.nav-group + .nav-group { margin-top:20px; padding-top:17px; border-top:1px solid var(--line); }
.nav-caption { margin:0 10px 7px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.13em; }
.nav-lock-note {
  margin:0 8px 10px;
  padding:8px 10px;
  border:1px solid color-mix(in srgb,var(--warn, #d97706) 28%,var(--line));
  border-radius:9px;
  background:var(--warn-soft, color-mix(in srgb, #d97706 12%, var(--surface)));
  color:var(--warn, #b45309);
  font-size:11px;
  line-height:1.5;
  font-weight:650;
}
.sidebar-link { display:flex; align-items:center; gap:12px; min-height:42px; margin:3px 0; padding:0 11px; border:1px solid transparent; border-radius:10px; color:var(--muted); text-decoration:none; font-size:12px; font-weight:650; transition:background .15s,border-color .15s,color .15s; background:transparent; font:inherit; width:100%; text-align:left; cursor:pointer; }
.sidebar-link :deep(.app-icon) { flex:0 0 18px; }
.sidebar-link:hover { color:var(--text); background:var(--surface-2); text-decoration:none; }
.sidebar-link:active:not(.active):not(.is-disabled) { color:var(--accent); background:var(--accent-soft); border-color:color-mix(in srgb,var(--accent) 24%,var(--line)); }
.sidebar-link.active { color:var(--accent); background:var(--accent-soft); border-color:color-mix(in srgb,var(--accent) 22%,var(--line)); box-shadow:inset 3px 0 0 var(--accent); }
.sidebar-link.is-disabled,
.sidebar-link.is-disabled:hover {
  color:var(--muted);
  background:transparent;
  border-color:transparent;
  opacity:.48;
  cursor:not-allowed;
}
.external-mark { margin-left:auto; opacity:.65; font-size:13px; }
.sidebar-bottom { padding:14px 10px 0; border-top:1px solid var(--line); }
.sidebar-mobile-controls { display:none; }
.sidebar-theme-group { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
.sidebar-control-label { color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.08em; }
.sidebar-theme-group :deep(.theme-switch) { max-width:100%; }
.sidebar-theme-group :deep(.theme-btn) { min-height:34px; padding:0 11px; font-size:11px; }
.sidebar-logout-button { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:42px; margin-top:14px; padding:0 12px; border:1px solid var(--line); border-radius:9px; color:var(--text); background:var(--surface); font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.sidebar-logout-button:hover:not(:disabled) { color:var(--red); border-color:color-mix(in srgb,var(--red) 35%,var(--line)); background:var(--red-soft); }
.sidebar-logout-button:disabled { opacity:.7; cursor:progress; }
.admin-logout-button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:0 13px; border:1px solid var(--line); border-radius:8px; color:var(--text); background:var(--surface); font:inherit; font-size:12px; font-weight:700; white-space:nowrap; cursor:pointer; }
.admin-logout-button:hover:not(:disabled) { background:var(--surface-2); border-color:color-mix(in srgb,var(--accent) 36%,var(--line)); }
.admin-logout-button:disabled { opacity:.7; cursor:progress; }
.topbar-theme-switcher { display:inline-flex; }
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
  .sidebar-mobile-controls { display:flex; flex-direction:column; gap:14px; margin-top:16px; padding-top:15px; border-top:1px solid var(--line); }
  .topbar-actions :deep(.admin-logout-button), .topbar-theme-switcher { display:none; }
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
  .admin-topbar { display:grid; grid-template-columns:32px minmax(0,1fr) auto; gap:5px 10px; align-items:center; min-height:0; padding:10px 16px 10px 13px; }
  .mobile-menu-toggle { grid-column:1; grid-row:1; width:32px; height:32px; }
  .topbar-title { grid-column:2; grid-row:1; }
  .topbar-kicker,.topbar-title p { display:none; }
  .topbar-title h1 { font-size:16px; line-height:1.25; }
  .topbar-actions { grid-column:3; grid-row:1; width:auto; gap:0; flex-wrap:nowrap; justify-content:flex-end; justify-self:end; padding-left:2px; }
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