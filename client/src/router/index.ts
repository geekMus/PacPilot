import { createRouter, createWebHistory } from "vue-router";
import {
  fetchAdminSession,
  isAdminAppRoute,
  isPasswordChangeAllowedRoute,
} from "../composables/useAdminSession";
import { useToast } from "../composables/useToast";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("../views/StatusView.vue"),
    },
    {
      path: "/admin/dashboard",
      name: "admin-dashboard",
      component: () => import("../views/AdminDashboardView.vue"),
    },
    {
      path: "/admin/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/admin/settings",
      name: "admin-settings",
      component: () => import("../views/AdminView.vue"),
    },
    {
      path: "/admin/system-settings",
      name: "admin-system-settings",
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
      component: () => import("../views/WorkflowView.vue"),
    },
    {
      path: "/admin/workflows/:id",
      name: "admin-workflow-detail",
      component: () => import("../views/WorkflowDetailView.vue"),
      props: true,
    },
    {
      path: "/admin/monitor",
      name: "admin-monitor",
      component: () => import("../views/MonitoringView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("../views/NotFoundView.vue"),
    },
  ],
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, top: 14, behavior: "smooth" };
    return { top: 0 };
  },
});

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

export default router;
