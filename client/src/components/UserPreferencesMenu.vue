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
import AppIcon from "@/components/AppIcon.vue";
import { setAppLocale, type AppLocale } from "@/i18n";
import { useTheme, type ThemeMode } from "@/composables/useTheme";

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
@reference "@/styles/tailwind.css";

.preferences-menu {
  @apply relative inline-flex shrink-0;
}
.preferences-trigger {
  @apply grid h-[38px] w-[38px] place-items-center rounded-[10px] border p-0 cursor-pointer;
  border-color: var(--line);
  color: var(--text);
  background: var(--surface);
}
.preferences-trigger:hover,
.preferences-trigger[data-state="open"] {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  color: var(--accent);
  background: var(--accent-soft);
}
.preferences-panel {
  @apply z-[1100] box-border rounded-[14px] border p-4 outline-none;
  width: min(280px, calc(100vw - 16px));
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.preferences-group + .preferences-group {
  @apply mt-4;
}
.preferences-group h2 {
  @apply mb-2 mt-0 text-[11px] font-bold;
  color: var(--muted);
}
.preferences-options {
  @apply flex gap-1 rounded-[10px] border p-[3px];
  border-color: var(--line);
  background: var(--bg);
}
.preferences-option {
  @apply min-h-[34px] min-w-0 flex-1 cursor-pointer whitespace-nowrap rounded-[7px] border-0 bg-transparent px-[7px] text-[11px] font-semibold;
  color: var(--muted);
}
.preferences-option:hover {
  color: var(--text);
}
.preferences-option[data-state="checked"] {
  color: var(--accent);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
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
