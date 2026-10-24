<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppHeader from "@/components/AppHeader.vue";
import AppFooter from "@/components/AppFooter.vue";
const { t } = useI18n();
</script>

<template>
  <main class="page not-found-page">
    <AppHeader brand="PacPilot" />
    <section class="not-found-card">
      <div class="not-found-code">404</div>
      <div class="page-kicker">PAGE NOT FOUND</div>
      <h1 class="page-title">{{ t("notFound.title") }}</h1>
      <p>{{ t("notFound.desc") }}</p>
      <div class="not-found-actions">
        <RouterLink class="app-button app-button--primary" to="/">{{ t("notFound.backStatus") }}</RouterLink>
        <RouterLink class="app-button app-button--secondary" to="/admin/dashboard">{{
          t("notFound.admin")
        }}</RouterLink>
      </div>
    </section>
    <AppFooter />
  </main>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.not-found-page {
  @apply flex min-h-dvh flex-col;
}
.not-found-card {
  @apply m-auto w-full max-w-[620px] rounded-[var(--radius)] border p-[clamp(26px,6vw,48px)];
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.not-found-code {
  @apply mb-[22px] font-mono font-bold tracking-tighter;
  color: var(--accent);
  font-size: clamp(55px, 10vw, 82px);
  line-height: 1;
}
.not-found-card .page-title {
  @apply mb-2.5 mt-2;
}
.not-found-card > p {
  @apply max-w-[39em] text-sm leading-[1.7];
  color: var(--muted);
}
.not-found-actions {
  @apply mt-6 flex flex-wrap gap-[9px];
}
@media (max-width: 520px) {
  .not-found-actions {
    @apply flex-col;
  }
  .not-found-actions > * {
    @apply w-full;
  }
}
</style>
