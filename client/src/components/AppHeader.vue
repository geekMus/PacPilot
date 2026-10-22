<script setup lang="ts">
import { useI18n } from "vue-i18n";
import UserPreferencesMenu from "@/components/UserPreferencesMenu.vue";
import BrandMark from "@/components/BrandMark.vue";

defineProps<{ brand?: string; sub?: string }>();
const { t } = useI18n();
</script>

<template>
  <header class="topbar">
    <div class="brand" :aria-label="t('app.projectName')">
      <BrandMark :size="36" />
      <span class="brand-copy">
        <span class="name">{{ brand || "PacPilot" }}</span>
        <small v-if="sub">{{ sub }}</small>
      </span>
    </div>
    <div class="header-tools">
      <nav class="nav" :aria-label="t('app.mainNav')"><slot /></nav>
      <UserPreferencesMenu />
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: var(--space-5);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  text-decoration: none;
  flex: 0 0 auto;
}
.brand-copy .name {
  display: block;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.brand-copy small {
  display: block;
  margin-top: 1px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.header-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}
.nav {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}
.nav :deep(a),
.nav :deep(button.linkish) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.nav :deep(a:hover),
.nav :deep(button.linkish:hover) {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  color: var(--accent);
}
.nav :deep(a.primary) {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.nav :deep(a.primary:hover) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast);
  filter: none;
  text-decoration: none;
}
.nav :deep(a.primary:active) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast);
}
@media (max-width: 720px) {
  .topbar {
    flex-wrap: wrap;
    gap: 12px;
  }
  .header-tools {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
