import { ref, watch, onMounted, onUnmounted } from "vue";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "genpac-theme";

function getStored(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyClass(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  root.classList.add(resolved === "dark" ? "theme-dark" : "theme-light");
}

const mode = ref<ThemeMode>(getStored());

export function useTheme() {
  let mql: MediaQueryList | null = null;

  const apply = () => applyClass(resolve(mode.value));

  const setMode = (next: ThemeMode) => {
    mode.value = next;
    localStorage.setItem(STORAGE_KEY, next);
    apply();
  };

  const onSystemChange = () => {
    if (mode.value === "system") apply();
  };

  onMounted(() => {
    apply();
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", onSystemChange);
  });

  onUnmounted(() => {
    mql?.removeEventListener("change", onSystemChange);
  });

  watch(mode, apply);

  // 首次同步（组件外也可能需要）
  apply();

  return { mode, setMode, resolved: () => resolve(mode.value) };
}

/** 在 main.ts 启动时尽早应用，避免闪烁 */
export function initThemeEarly() {
  const m = getStored();
  applyClass(resolve(m));
}
