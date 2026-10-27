import { defineAsyncComponent, type Component } from "vue";

/**
 * 用户偏好菜单（主题/语言）依赖 reka-ui 的 Popover、RadioGroup 与 floating-ui。
 * 它只有用户点击后才有交互需求，因此改为异步加载，把浮层、roving focus 等代码移出首屏关键路径。
 */
export const UserPreferencesMenu: Component = defineAsyncComponent(
  () => import("@/components/UserPreferencesMenu.vue")
);

/**
 * 挂载后空闲时预取偏好菜单代码，正常网络下几乎与同步加载同时出现，
 * 避免用户第一次点击时还要等一次网络往返。
 */
export function prefetchUserPreferencesMenu(): void {
  const load = (): void => {
    void import("@/components/UserPreferencesMenu.vue").catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === "function")
    window.requestIdleCallback(load, { timeout: 2000 });
  else window.setTimeout(load, 1200);
}
