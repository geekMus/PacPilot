import { createApp } from "vue";
import App from "@/App.vue";
import router from "@/router";
import { i18n, persistLocale, readStoredLocale } from "@/i18n";
import { initThemeEarly } from "@/composables/useTheme";
import { loadRuntimeConfig } from "@/api/runtime-config";
import { onUnauthorized } from "@/api/auth-events";
import "@/styles/theme.css";
import "@/styles/scrollbars.css";
import "@/styles/overlays.css";
import "@/styles/tailwind.css";

initThemeEarly();
persistLocale(readStoredLocale());

async function bootstrap(): Promise<void> {
  // Resolve the backend origin before the first request is issued: a purely
  // static frontend reads it from config.json, while the self-hosted build
  // keeps using the same origin.
  await loadRuntimeConfig();

  onUnauthorized(() => {
    const { pathname, search } = window.location;
    if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) return;
    void router.replace({ name: "login", query: { redirect: pathname + search } });
  });

  createApp(App).use(router).use(i18n).mount("#app");
}

void bootstrap();
