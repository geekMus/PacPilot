<script setup lang="ts">
import { useTheme, type ThemeMode } from "../composables/useTheme";

const { mode, setMode } = useTheme();

const options: { value: ThemeMode; label: string; title: string }[] = [
  { value: "system", label: "自动", title: "跟随系统" },
  { value: "light", label: "浅色", title: "浅色模式" },
  { value: "dark", label: "深色", title: "深色模式" },
];
</script>

<template>
  <div class="theme-switch" role="group" aria-label="主题切换">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="theme-btn"
      :class="{ active: mode === opt.value }"
      :title="opt.title"
      @click="setMode(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 50;
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.theme-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  cursor: pointer;
  line-height: 1;
}

.theme-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.theme-btn:hover {
  color: var(--text);
}

@media (max-width: 720px) {
  .theme-switch {
    top: 10px;
    right: 10px;
  }
  .theme-btn {
    min-height: 36px;
    padding: 0 11px;
  }
}
</style>
