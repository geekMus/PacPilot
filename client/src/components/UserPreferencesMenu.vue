<script setup lang="ts">
import { ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  RadioGroupItem,
  RadioGroupRoot,
} from "reka-ui";
import AppIcon from "./AppIcon.vue";
import { setAppLocale, type AppLocale } from "../i18n";
import { useTheme, type ThemeMode } from "../composables/useTheme";

const { t, locale } = useI18n();
const { mode, setMode } = useTheme();
const open = ref(false);
const panelId = `user-preferences-${useId()}`;

const themes: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "theme.auto" },
  { value: "light", label: "theme.light" },
  { value: "dark", label: "theme.dark" },
];

const languages: { value: AppLocale; label: string }[] = [
  { value: "zh_CN", label: "app.zh" },
  { value: "en_US", label: "app.en" },
];
</script>

<template>
  <div class="preferences-menu">
    <PopoverRoot :open="open" @update:open="open = $event">
      <PopoverTrigger as-child>
        <button
          class="preferences-trigger"
          type="button"
          :aria-label="t('preferences.open')"
          :title="t('preferences.open')"
        >
          <AppIcon name="sliders-horizontal" :size="17" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          :id="panelId"
          class="preferences-panel"
          :aria-label="t('preferences.title')"
          align="end"
          side="bottom"
          :side-offset="6"
          :collision-padding="8"
        >
          <div class="preferences-group">
            <h2>{{ t("preferences.appearance") }}</h2>
            <RadioGroupRoot
              class="preferences-options"
              :model-value="mode"
              :aria-label="t('preferences.appearance')"
              @update:model-value="setMode($event as ThemeMode)"
            >
              <RadioGroupItem
                v-for="theme in themes"
                :key="theme.value"
                :value="theme.value"
                class="preferences-option"
              >
                {{ t(theme.label) }}
              </RadioGroupItem>
            </RadioGroupRoot>
          </div>
          <div class="preferences-group">
            <h2>{{ t("preferences.language") }}</h2>
            <RadioGroupRoot
              class="preferences-options"
              :model-value="locale"
              :aria-label="t('preferences.language')"
              @update:model-value="setAppLocale($event as AppLocale)"
            >
              <RadioGroupItem
                v-for="language in languages"
                :key="language.value"
                :value="language.value"
                class="preferences-option"
              >
                {{ t(language.label) }}
              </RadioGroupItem>
            </RadioGroupRoot>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>

<style>
.preferences-menu {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}
.preferences-trigger {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  background: var(--surface);
  cursor: pointer;
}
.preferences-trigger:hover,
.preferences-trigger[data-state="open"] {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  color: var(--accent);
  background: var(--accent-soft);
}
.preferences-panel {
  z-index: 1100;
  box-sizing: border-box;
  width: min(280px, calc(100vw - 16px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  outline: none;
}
.preferences-group + .preferences-group {
  margin-top: 16px;
}
.preferences-group h2 {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.preferences-options {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
}
.preferences-option {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 0 7px;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}
.preferences-option:hover {
  color: var(--text);
}
.preferences-option[data-state="checked"] {
  color: var(--accent);
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}
.preferences-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .preferences-trigger,
  .preferences-option {
    transition: none;
  }
}
</style>
