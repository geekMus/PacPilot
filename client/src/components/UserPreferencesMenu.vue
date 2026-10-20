<script setup lang="ts">
import { onMounted, onUnmounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import { setAppLocale, type AppLocale } from "../i18n";
import { useTheme, type ThemeMode } from "../composables/useTheme";
import { useViewportPanel } from "../composables/useViewportPanel";

const { t, locale } = useI18n();
const { mode, setMode } = useTheme();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const panelId = `user-preferences-${useId()}`;
const { style: panelStyle } = useViewportPanel(trigger, panel, open, {
  align: "end",
  maxWidth: 280,
});

function onDocumentPointerDown(event: PointerEvent): void {
  if (
    event.target instanceof Node &&
    !root.value?.contains(event.target) &&
    !panel.value?.contains(event.target)
  ) {
    open.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") open.value = false;
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});

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
  <div ref="root" class="preferences-menu">
    <button
      ref="trigger"
      class="preferences-trigger"
      type="button"
      :aria-label="t('preferences.open')"
      :aria-expanded="open"
      :aria-controls="panelId"
      :title="t('preferences.open')"
      @click="open = !open"
    >
      <AppIcon name="sliders-horizontal" :size="17" />
    </button>
    <Teleport to="body">
      <section
        v-if="open"
        :id="panelId"
        ref="panel"
        class="preferences-panel"
        :style="panelStyle"
        :aria-label="t('preferences.title')"
      >
        <div class="preferences-group">
          <h2>{{ t("preferences.appearance") }}</h2>
          <div class="preferences-options" role="group" :aria-label="t('preferences.appearance')">
            <button
              v-for="theme in themes"
              :key="theme.value"
              type="button"
              :aria-pressed="mode === theme.value"
              :class="{ active: mode === theme.value }"
              @click="setMode(theme.value)"
            >
              {{ t(theme.label) }}
            </button>
          </div>
        </div>
        <div class="preferences-group">
          <h2>{{ t("preferences.language") }}</h2>
          <div class="preferences-options" role="group" :aria-label="t('preferences.language')">
            <button
              v-for="language in languages"
              :key="language.value"
              type="button"
              :aria-pressed="locale === language.value"
              :class="{ active: locale === language.value }"
              @click="setAppLocale(language.value)"
            >
              {{ t(language.label) }}
            </button>
          </div>
        </div>
      </section>
    </Teleport>
  </div>
</template>

<style scoped>
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
.preferences-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  color: var(--accent);
  background: var(--accent-soft);
}
.preferences-panel {
  z-index: 100;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow);
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
.preferences-options button {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 0 7px;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}
.preferences-options button:hover {
  color: var(--text);
}
.preferences-options button.active {
  color: var(--accent);
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}
</style>
