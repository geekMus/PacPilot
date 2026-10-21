import { createRouter, createWebHistory } from "vue-router";
import { i18n } from "../i18n";
import { fetchAdminSession, isAdminAppRoute } from "../composables/useAdminSession";

/** Site brand matches package.json / GitHub repo (kebab-case), like many OSS tools. */
export const APP_BRAND = "PacPilot";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      meta: { titleKey: "status.sub" },
      component: () => import("../views/StatusView.vue"),
    },
    {
      path: "/admin/dashboard",
      name: "admin-dashboard",
      meta: { titleKey: "nav.dashboard" },
      component: () => import("../views/AdminDashboardView.vue"),
    },
    {
      path: "/admin/login",
      name: "login",
      meta: { titleKey: "nav.login" },
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/admin/settings",
      name: "admin-settings",
      meta: { titleKey: "nav.settings" },
      component: () => import("../views/AdminView.vue"),
    },
    {
      path: "/admin/system-settings",
      name: "admin-system-settings",
      meta: { titleKey: "nav.systemSettings" },
      component: () => import("../views/SystemSettingsView.vue"),
    },
    {
      // 兼容旧地址，并将后台默认入口统一指向总览。
      path: "/admin",
      redirect: { name: "admin-dashboard" },
    },
    {
      path: "/admin/workflows",
      name: "admin-workflows",
      meta: { titleKey: "nav.workflow" },
      component: () => import("../views/WorkflowView.vue"),
    },
    {
      path: "/admin/workflows/:id",
      name: "admin-workflow-detail",
      meta: { titleKey: "workflow.detailTitle" },
      component: () => import("../views/WorkflowDetailView.vue"),
      props: true,
    },
    {
      path: "/admin/monitor",
      name: "admin-monitor",
      meta: { titleKey: "nav.monitor" },
      component: () => import("../views/MonitoringView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      meta: { titleKey: "notFound.title" },
      component: () => import("../views/NotFoundView.vue"),
    },
  ],
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, top: 14, behavior: "smooth" };
    return { top: 0 };
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

export default router;
