import { nextTick, watch } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { i18n } from "@/i18n";
import { fetchAdminSession, isAdminAppRoute } from "@/composables/useAdminSession";

/** Site brand matches package.json / GitHub repo (kebab-case), like many OSS tools. */
const APP_BRAND = "PacPilot";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      meta: { titleKey: "status.sub" },
      component: () => import("@/views/StatusView.vue"),
    },
    {
      path: "/admin",
      // 服务端把裸 `/admin` 交给 SPA，这里统一重定向到控制台。
      redirect: "/admin/dashboard",
    },
    {
      path: "/admin/dashboard",
      name: "admin-dashboard",
      meta: { titleKey: "nav.dashboard", layout: "admin" },
      component: () => import("@/views/AdminDashboardView.vue"),
    },
    {
      path: "/admin/login",
      name: "login",
      meta: { titleKey: "nav.login" },
      component: () => import("@/views/LoginView.vue"),
    },
    {
      path: "/admin/settings",
      name: "admin-settings",
      meta: { titleKey: "nav.settings", layout: "admin" },
      component: () => import("@/views/AdminView.vue"),
    },
    {
      path: "/admin/system-settings",
      name: "admin-system-settings",
      meta: { titleKey: "nav.systemSettings", layout: "admin" },
      component: () => import("@/views/SystemSettingsView.vue"),
    },
    {
      path: "/admin/workflows",
      name: "admin-workflows",
      meta: { titleKey: "nav.workflow", layout: "admin" },
      component: () => import("@/views/WorkflowView.vue"),
    },
    {
      path: "/admin/workflows/:id",
      name: "admin-workflow-detail",
      meta: { titleKey: "workflow.detailTitle", layout: "admin" },
      component: () => import("@/views/WorkflowDetailView.vue"),
      props: true,
    },
    {
      path: "/admin/monitor",
      name: "admin-monitor",
      meta: { titleKey: "nav.monitor", layout: "admin" },
      component: () => import("@/views/MonitoringView.vue"),
    },
    {
      path: "/admin/logs",
      name: "admin-logs",
      meta: { titleKey: "nav.logs", layout: "admin" },
      component: () => import("@/views/LogsView.vue"),
    },
    {
      path: "/admin/notifications",
      name: "admin-notifications",
      meta: { titleKey: "nav.notifications", layout: "admin" },
      component: () => import("@/views/NotificationsView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      meta: { titleKey: "notFound.title" },
      component: () => import("@/views/NotFoundView.vue"),
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    return nextTick().then(() => {
      const selector =
        to.meta.layout === "admin"
          ? ".admin-content .app-scroll-area-viewport"
          : ".app-public-scroll .app-scroll-area-viewport";
      const viewport = document.querySelector<HTMLElement>(selector);
      if (!viewport) return { top: 0 };

      // 浏览器前进/后退时恢复离开时的位置，而不是一律回到顶部。
      if (savedPosition) {
        viewport.scrollTo({ top: savedPosition.top, behavior: "auto" });
        return false;
      }

      if (to.hash) {
        // Resolve anchors inside the active scroll viewport first. A document-wide
        // query can select a duplicate/off-screen element and calculate the wrong offset.
        const target = viewport.querySelector<HTMLElement>(to.hash);
        if (target) {
          const top =
            target.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top +
            viewport.scrollTop -
            14;
          viewport.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
          return false;
        }
      }

      viewport.scrollTo({ top: 0, behavior: "auto" });
      return false;
    });
  },
});

function applyDocumentTitle(pageTitle?: unknown): void {
  // Pattern used by many OSS apps: "Page · Brand" (middle dot separates section from product).
  const page = typeof pageTitle === "string" ? pageTitle.trim() : "";
  document.title = page ? `${page} · ${APP_BRAND}` : APP_BRAND;
}

router.beforeEach(async (to) => {
  const isAdminPath = isAdminAppRoute(to.path);
  if (!isAdminPath && to.path !== "/") return true;

  try {
    const session = await fetchAdminSession();
    if (session.adminCredentialsMissing) {
      return isAdminPath && to.name !== "login" ? { name: "login" } : true;
    }
    if (!isAdminPath) return true;
    if (to.name === "login") return true;
    if (!session.loggedIn) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
  } catch {
    // Session probe failed — let the page handle API errors.
    return true;
  }
  return true;
});

router.afterEach((to) => {
  const titleKey = typeof to.meta.titleKey === "string" ? to.meta.titleKey : "";
  applyDocumentTitle(titleKey ? i18n.global.t(titleKey) : "");
});

// 切换语言时当前页面不会重新导航，标题需要主动跟着刷新。
watch(i18n.global.locale, () => {
  const titleKey = router.currentRoute.value.meta.titleKey;
  applyDocumentTitle(typeof titleKey === "string" ? i18n.global.t(titleKey) : "");
});

export default router;
