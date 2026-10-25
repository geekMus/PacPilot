<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type Meta } from "@/api/client";
import { invalidateAdminSessionCache } from "@/composables/useAdminSession";
import AppIcon from "@/components/AppIcon.vue";
import { useI18n } from "vue-i18n";
import BrandMark from "@/components/BrandMark.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";

type AdminSection =
  "dashboard" | "settings" | "system-settings" | "monitor" | "workflow" | "logs" | "notifications";
const props = defineProps<{ active: AdminSection; open: boolean }>();
const { t } = useI18n();
const router = useRouter();
const logoutBusy = ref(false);

// Backend identity shown above the logout button: a deployment may be pointing
// at a remote instance, so the storage driver and version must come from the
// backend we actually talk to rather than being assumed locally.
const backendInfo = ref<Meta | null>(null);
const backendOnline = ref(true);
const storageLabel = computed(() => {
  const driver = backendInfo.value?.storageDriver;
  if (!driver) return "—";
  return driver === "memory" ? t("layout.storageMemory") : "SQLite";
});

onMounted(async () => {
  try {
    backendInfo.value = await api.meta();
    backendOnline.value = true;
  } catch {
    backendOnline.value = false;
  }
});

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

    <AppScrollArea
      root-class="sidebar-nav"
      orientation="vertical"
      role="navigation"
      :aria-label="t('layout.adminConsole')"
    >
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
          to="/admin/logs"
          class="sidebar-link"
          :class="{ active: props.active === 'logs' }"
          :aria-current="props.active === 'logs' ? 'page' : undefined"
        >
          <AppIcon name="file-text" :size="18" />
          <span>{{ t("nav.logs") }}</span>
        </RouterLink>
        <RouterLink
          to="/admin/notifications"
          class="sidebar-link"
          :class="{ active: props.active === 'notifications' }"
          :aria-current="props.active === 'notifications' ? 'page' : undefined"
        >
          <AppIcon name="zap" :size="18" />
          <span>{{ t("nav.notifications") }}</span>
        </RouterLink>
      </section>

      <section class="nav-group" aria-labelledby="nav-business">
        <p id="nav-business" class="nav-caption">{{ t("layout.navBusiness") }}</p>
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
      </section>

      <section class="nav-group" aria-labelledby="nav-system">
        <p id="nav-system" class="nav-caption">{{ t("layout.navSystem") }}</p>
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
        <span class="status-dot" :class="{ offline: !backendOnline }"></span>
        <span>{{
          backendOnline ? t("layout.adminConnected") : t("layout.backendUnreachable")
        }}</span>
      </div>
      <dl class="sidebar-backend">
        <div>
          <dt>{{ t("layout.backendVersion") }}</dt>
          <dd>{{ backendInfo?.version || "—" }}</dd>
        </div>
        <div>
          <dt>{{ t("layout.backendStorage") }}</dt>
          <dd>{{ storageLabel }}</dd>
        </div>
      </dl>
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
@reference "@/styles/tailwind.css";

.admin-sidebar {
  @apply sticky top-0 z-50 flex h-dvh w-[var(--sidebar-width)] flex-[0_0_var(--sidebar-width)] flex-col border-r px-[14px] pt-[22px] pb-4;
  border-color: var(--line);
  background: var(--surface);
}
.sidebar-brand {
  @apply mx-2 mb-[26px] flex items-center gap-[11px] no-underline;
  color: var(--text);
}
.brand-copy {
  @apply min-w-0;
}
.brand-copy strong {
  @apply block text-sm font-extrabold tracking-tight;
}
.brand-copy small {
  @apply mt-[3px] block text-[10px] font-bold tracking-[0.12em];
  color: var(--muted);
}
.sidebar-nav {
  @apply min-h-0 flex-1 p-0;
}
.sidebar-nav :deep(.app-scroll-area-viewport) {
  @apply px-0.5 pb-2.5;
}
.nav-group + .nav-group {
  @apply mt-5 border-t pt-[17px];
  border-color: var(--line);
}
.nav-caption {
  @apply mx-2.5 mb-[7px] mt-0 text-[10px] font-extrabold tracking-[0.13em];
  color: var(--muted);
}
.sidebar-link {
  @apply my-[3px] flex min-h-[42px] w-full cursor-pointer items-center gap-3 rounded-[10px] border border-transparent bg-transparent px-[11px] text-left text-xs font-semibold no-underline transition-colors;
  color: var(--muted);
}
.sidebar-link :deep(.app-icon) {
  @apply flex-[0_0_18px];
}
.sidebar-link:hover {
  @apply no-underline;
  color: var(--text);
  background: var(--surface-2);
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
  @apply cursor-not-allowed border-transparent bg-transparent opacity-50;
  color: var(--muted);
}
.sidebar-bottom {
  @apply border-t px-2.5 pt-3.5;
  border-color: var(--line);
}
.sidebar-controls {
  @apply mt-4 flex flex-col gap-3.5 border-t pt-[15px];
  border-color: var(--line);
}
.sidebar-logout-button {
  @apply mt-3.5 flex min-h-11 w-full cursor-pointer items-center justify-start gap-2.5 rounded-[10px] border px-3 text-xs font-bold transition-colors;
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
  color: var(--red);
  background: var(--red-soft);
}
.sidebar-logout-button :deep(.app-icon) {
  @apply flex-none;
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
  @apply cursor-progress opacity-70 shadow-none;
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-logout-button {
    transition: none;
  }
}
.sidebar-status {
  @apply flex items-center gap-2 text-[11px] font-bold;
  color: var(--text);
}
.status-dot {
  @apply h-[7px] w-[7px] rounded-full;
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}
.status-dot.offline {
  background: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}
/* Backend identity: which instance this console is actually attached to. */
.sidebar-backend {
  @apply m-0 mt-2 grid gap-[5px];
}
.sidebar-backend > div {
  @apply flex min-w-0 items-baseline justify-between gap-2.5;
}
.sidebar-backend dt {
  @apply shrink-0 text-[10px];
  color: var(--muted);
}
.sidebar-backend dd {
  @apply m-0 min-w-0 overflow-hidden text-right font-mono text-[10px] whitespace-nowrap;
  color: var(--text);
  text-overflow: ellipsis;
}
@media (max-width: 900px) {
  .admin-sidebar {
    /* Slide the drawer with `left` rather than `translate`/`transform`.
       Mixing a raw `transform: translateX()` with Tailwind's `translate-*`
       utilities is the classic failure: those write the separate `translate`
       property, so the two never override each other and the drawer stays
       stuck off-screen. Keeping the offset in `left` — the same property the
       open state animates to — avoids that and interpolates reliably. */
    @apply fixed inset-y-0 z-50 h-dvh shadow-none;
    left: calc(var(--sidebar-width, 258px) * -1);
    transition: left 0.2s ease;
  }
  .admin-sidebar.is-open {
    left: 0;
    box-shadow: 18px 0 48px rgba(10, 20, 35, 0.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .admin-sidebar {
    transition: none;
  }
}
</style>
