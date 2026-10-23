import { createApp } from "vue";
import App from "@/App.vue";
import router from "@/router";
import { i18n, persistLocale, readStoredLocale } from "@/i18n";
import { initThemeEarly } from "@/composables/useTheme";
import "@/styles/theme.css";
import "@/styles/scrollbars.css";
import "@/styles/overlays.css";
import "@/styles/controls.css";

initThemeEarly();
persistLocale(readStoredLocale());

createApp(App).use(router).use(i18n).mount("#app");
