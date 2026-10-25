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
@reference "@/styles/tailwind.css";

.topbar {
  @apply mb-[var(--space-5)] flex items-center justify-between gap-5;
}
.brand {
  @apply flex shrink-0 items-center gap-2.5 no-underline;
  color: var(--text);
}
.brand-copy .name {
  @apply block text-sm font-bold tracking-tight;
}
.brand-copy small {
  @apply mt-px block text-[10px] font-bold uppercase tracking-[0.12em];
  color: var(--muted);
}
.header-tools {
  @apply flex min-w-0 items-center justify-end gap-2.5;
}
.nav {
  @apply flex flex-wrap items-center justify-end gap-1.5;
}
.nav :deep(a) {
  @apply inline-flex min-h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-[9px] border px-3 text-xs font-semibold no-underline;
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
}
.nav :deep(a:hover) {
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
    @apply flex-wrap gap-3;
  }
  .header-tools {
    @apply w-full justify-between;
  }
}
</style>
