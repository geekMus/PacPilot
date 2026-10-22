<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/client";
import { invalidateAdminSessionCache } from "@/composables/useAdminSession";
import AppIcon from "@/components/AppIcon.vue";
import { useI18n } from "vue-i18n";
import BrandMark from "@/components/BrandMark.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";

type AdminSection = "dashboard" | "settings" | "system-settings" | "monitor" | "workflow";
const props = defineProps<{ active: AdminSection; open: boolean }>();
const { t } = useI18n();
const router = useRouter();
const logoutBusy = ref(false);

async function logout(): Promise<void> {
  if (logoutBusy.value) return;
  logoutBusy.value = true;
  try {
    await api.logout();
    invalidateAdminSessionCache();
  } finally {
    try {
      await router.replace("/admin/login");
    } finally {
      logoutBusy.value = false;
    }
  }
}
</script>

<template>
    <aside class="admin-sidebar" :class="{ 'is-open': props.open }">
      <div class="sidebar-brand" :aria-label="t('app.projectName')">
        <BrandMark :size="40" />
        <span class="brand-copy">
          <strong>PacPilot</strong>
          <small>{{ t("layout.adminConsole") }}</small>
        </span>
      </div>

      <AppScrollArea root-class="sidebar-nav" orientation="vertical" role="navigation" :aria-label="t('layout.adminConsole')">
        <section class="nav-group" aria-labelledby="nav-workbench">
          <p id="nav-workbench" class="nav-caption">{{ t("layout.workbench") }}</p>
          <RouterLink
            to="/admin/dashboard"
            class="sidebar-link"
            :class="{ active: props.active === 'dashboard' }"
            :aria-current="props.active === 'dashboard' ? 'page' : undefined"
          >
            <AppIcon name="layout-dashboard" :size="18" />
            <span>{{ t("nav.dashboard") }}</span>
          </RouterLink>
          <RouterLink
            to="/admin/monitor"
            class="sidebar-link"
            :class="{ active: props.active === 'monitor' }"
            :aria-current="props.active === 'monitor' ? 'page' : undefined"
          >
            <AppIcon name="activity" :size="18" />
            <span>{{ t("nav.monitor") }}</span>
          </RouterLink>
          <RouterLink
            to="/admin/settings"
            class="sidebar-link"
            :class="{ active: props.active === 'settings' }"
            :aria-current="props.active === 'settings' ? 'page' : undefined"
          >
            <AppIcon name="sliders-horizontal" :size="18" />
            <span>{{ t("nav.settings") }}</span>
          </RouterLink>
          <RouterLink
            to="/admin/workflows"
            class="sidebar-link"
            :class="{ active: props.active === 'workflow' }"
            :aria-current="props.active === 'workflow' ? 'page' : undefined"
          >
            <AppIcon name="workflow" :size="18" />
            <span>{{ t("nav.workflow") }}</span>
          </RouterLink>
          <RouterLink
            to="/admin/system-settings"
            class="sidebar-link"
            :class="{ active: props.active === 'system-settings' }"
            :aria-current="props.active === 'system-settings' ? 'page' : undefined"
          >
            <AppIcon name="settings-2" :size="18" />
            <span>{{ t("nav.systemSettings") }}</span>
          </RouterLink>
        </section>

        <section class="nav-group" aria-labelledby="nav-services">
          <p id="nav-services" class="nav-caption">{{ t("nav.services") }}</p>
          <RouterLink to="/" class="sidebar-link">
            <AppIcon name="globe" :size="18" />
            <span>{{ t("nav.publicStatus") }}</span>
          </RouterLink>
        </section>
      </AppScrollArea>

      <div class="sidebar-bottom">
        <div class="sidebar-status">
          <span class="status-dot"></span><span>{{ t("layout.adminConnected") }}</span>
        </div>
        <span class="sidebar-note">{{ t("layout.settingsStoredLocal") }}</span>
        <div class="sidebar-controls">
          <button
            type="button"
            class="sidebar-logout-button"
            :disabled="logoutBusy"
            :title="logoutBusy ? t('layout.loggingOutTitle') : t('layout.logoutTitle')"
            @click="logout"
          >
            <AppIcon
              :name="logoutBusy ? 'loader-circle' : 'log-out'"
              :size="16"
              :class="{ 'icon-spinning': logoutBusy }"
            />
            {{ logoutBusy ? t("layout.loggingOut") : t("nav.logout") }}
          </button>
        </div>
      </div>
    </aside>
</template>

<style scoped>
.admin-sidebar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  flex: 0 0 var(--sidebar-width);
  flex-direction: column;
  width: var(--sidebar-width);
  height: 100dvh;
  padding: 22px 14px 16px;
  border-right: 1px solid var(--line);
  background: var(--surface);
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 0 8px 26px;
  color: var(--text);
  text-decoration: none;
}

.brand-copy {
  min-width: 0;
}
.brand-copy strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.035em;
}
.brand-copy small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.sidebar-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 2px 10px;
}
.nav-group + .nav-group {
  margin-top: 20px;
  padding-top: 17px;
  border-top: 1px solid var(--line);
}
.nav-caption {
  margin: 0 10px 7px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
}
.sidebar-link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  margin: 3px 0;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--muted);
  text-decoration: none;
  font-size: 12px;
  font-weight: 650;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  background: transparent;
  width: 100%;
  text-align: left;
  cursor: pointer;
}
.sidebar-link :deep(.app-icon) {
  flex: 0 0 18px;
}
.sidebar-link:hover {
  color: var(--text);
  background: var(--surface-2);
  text-decoration: none;
}
.sidebar-link:active:not(.active):not(.is-disabled) {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--line));
}
.sidebar-link.active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 22%, var(--line));
  box-shadow: inset 3px 0 0 var(--accent);
}
.sidebar-link.is-disabled,
.sidebar-link.is-disabled:hover {
  color: var(--muted);
  background: transparent;
  border-color: transparent;
  opacity: 0.48;
  cursor: not-allowed;
}
.sidebar-bottom {
  padding: 14px 10px 0;
  border-top: 1px solid var(--line);
}
.sidebar-controls {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
  padding-top: 15px;
  border-top: 1px solid var(--line);
}
.sidebar-logout-button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  margin-top: 14px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--red) 28%, var(--line));
  border-radius: 10px;
  color: var(--red);
  background: var(--red-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}
.sidebar-logout-button :deep(.app-icon) {
  flex: 0 0 auto;
  color: var(--red);
}
.sidebar-logout-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--red) 58%, var(--line));
  background: color-mix(in srgb, var(--red) 16%, var(--surface));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--red) 10%, transparent);
}
.sidebar-logout-button:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}
.sidebar-logout-button:disabled {
  opacity: 0.72;
  cursor: progress;
  box-shadow: none;
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-logout-button {
    transition: none;
  }
}
.sidebar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}
.sidebar-note {
  display: block;
  margin-top: 7px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .admin-sidebar {
    position: fixed;
    z-index: 50;
    inset: 0 auto 0 0;
    height: 100dvh;
    box-shadow: none;
    transform: translateX(-102%);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }
  .admin-sidebar.is-open {
    transform: translateX(0);
    box-shadow: 18px 0 48px rgba(10, 20, 35, 0.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .admin-sidebar { transition: none; }
}
</style>
