<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme, type ThemeMode } from "../composables/useTheme";
const { t } = useI18n();
const { mode, setMode } = useTheme();
const options = computed(() => [
  { value: "system" as ThemeMode, label: t("theme.auto"), title: t("theme.followSystem") },
  { value: "light" as ThemeMode, label: t("theme.light"), title: t("theme.lightMode") },
  { value: "dark" as ThemeMode, label: t("theme.dark"), title: t("theme.darkMode") },
]);
</script>

<template>
  <div class="theme-switch" role="group" :aria-label="t('theme.switch')">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="theme-btn"
      :class="{ active: mode === opt.value }"
      :aria-pressed="mode === opt.value"
      :title="opt.title"
      @click="setMode(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.theme-switch {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}
.theme-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  min-height: 30px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.theme-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.theme-btn:hover {
  color: var(--text);
}
.theme-btn:active {
  color: var(--accent);
  background: var(--accent-soft);
}
@media (max-width: 620px) {
  .theme-switch {
    gap: 0;
    padding: 2px;
    border-radius: 8px;
  }
  .theme-btn {
    min-height: 30px;
    padding: 0 6px;
    font-size: 10px;
  }
}
</style>
