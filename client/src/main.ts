import { createApp } from "vue";
import App from "@/App.vue";
import router from "@/router";
import { i18n, ensureLocaleMessages, persistLocale, readStoredLocale } from "@/i18n";
import { initThemeEarly } from "@/composables/useTheme";
import { loadRuntimeConfig } from "@/api/runtime-config";
import { onUnauthorized } from "@/api/auth-events";
import { invalidateAdminSessionCache } from "@/composables/useAdminSession";
import "@/styles/theme.css";
import "@/styles/scrollbars.css";
import "@/styles/overlays.css";
import "@/styles/tailwind.css";

const initialLocale = readStoredLocale();
initThemeEarly();
persistLocale(initialLocale);

async function bootstrap(): Promise<void> {
  // 运行时配置与首屏挂载并行解析：纯静态部署需要它提供后端源，但把它挡在
  // mount 之前会让首屏多等一次网络往返（弱网下约数分之一秒，直接拖低
  // FCP/LCP）。首个 API 请求由 `ensureRuntimeConfig()` 负责等待同一个 Promise。
  void loadRuntimeConfig();

  onUnauthorized(() => {
    // 401 说明会话已失效，缓存的会话状态必须立刻作废，否则守卫可能继续认为已登录。
    invalidateAdminSessionCache();
    const { pathname, search } = window.location;
    if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) return;
    void router.replace({ name: "login", query: { redirect: pathname + search } });
  });

  // 中文词条已静态打包，这里同步挂载、不多等任何往返；英文用户则必须先取回英文
  // 目录，否则首屏会先按回退语言渲染出中文再整体翻转。
  if (initialLocale === "en_US") await ensureLocaleMessages(initialLocale);

  createApp(App).use(router).use(i18n).mount("#app");
}

void bootstrap();
