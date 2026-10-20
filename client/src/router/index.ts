import { createRouter, createWebHistory } from "vue-router";
import {
  fetchAdminSession,
  isAdminAppRoute,
  isPasswordChangeAllowedRoute,
} from "../composables/useAdminSession";
import { useToast } from "../composables/useToast";

/** Site brand matches package.json / GitHub repo (kebab-case), like many OSS tools. */
export const APP_BRAND = "genpac-runner";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      meta: { title: "公共状态" },
      component: () => import("../views/StatusView.vue"),
    },
    {
      path: "/admin/dashboard",
      name: "admin-dashboard",
      meta: { title: "系统总览" },
      component: () => import("../views/AdminDashboardView.vue"),
    },
    {
      path: "/admin/login",
      name: "login",
      meta: { title: "登录" },
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/admin/settings",
      name: "admin-settings",
      meta: { title: "配置管理" },
      component: () => import("../views/AdminView.vue"),
    },
    {
      path: "/admin/system-settings",
      name: "admin-system-settings",
      meta: { title: "系统设置" },
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
      meta: { title: "工作流" },
      component: () => import("../views/WorkflowView.vue"),
    },
    {
      path: "/admin/workflows/:id",
      name: "admin-workflow-detail",
      meta: { title: "工作流详情" },
      component: () => import("../views/WorkflowDetailView.vue"),
      props: true,
    },
    {
      path: "/admin/monitor",
      name: "admin-monitor",
      meta: { title: "网络监控" },
      component: () => import("../views/MonitoringView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      meta: { title: "页面未找到" },
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

const PASSWORD_CHANGE_TOAST =
  "请先修改默认管理密码后，再使用其他管理功能。";

router.beforeEach(async (to, from) => {
  if (!isAdminAppRoute(to.path)) return true;
  if (to.name === "login") return true;
  if (isPasswordChangeAllowedRoute(to.path)) return true;

  try {
    const session = await fetchAdminSession();
    if (!session.loggedIn) {
      return { name: "login", query: { redirect: to.fullPath } };
    }
    if (session.mustChangePassword) {
      // Avoid repeated toasts when already bouncing from another blocked page.
      const alreadyLeavingBlocked =
        isAdminAppRoute(from.path) &&
        !isPasswordChangeAllowedRoute(from.path) &&
        from.name !== "login";
      if (!alreadyLeavingBlocked) {
        useToast().notify(PASSWORD_CHANGE_TOAST, "warning", 5500);
      }
      return { name: "admin-settings" };
    }
  } catch {
    // Session probe failed — let the page handle API errors.
    return true;
  }
  return true;
});

router.afterEach((to) => {
  applyDocumentTitle(to.meta.title);
});

export default router;
