import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("../views/StatusView.vue"),
    },
    {
      path: "/admin/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/admin",
      name: "admin",
      component: () => import("../views/AdminView.vue"),
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
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
