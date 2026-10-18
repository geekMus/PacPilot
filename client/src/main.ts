import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { initThemeEarly } from "./composables/useTheme";
import "./styles/theme.css";

initThemeEarly();

createApp(App).use(router).mount("#app");
