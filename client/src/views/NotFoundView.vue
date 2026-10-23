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
.not-found-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.not-found-card {
  max-width: 620px;
  width: 100%;
  margin: auto;
  padding: clamp(26px, 6vw, 48px);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.not-found-code {
  margin-bottom: 22px;
  color: var(--accent);
  font: 750 clamp(55px, 10vw, 82px) / 1 var(--font-mono);
  letter-spacing: -0.07em;
}
.not-found-card .page-title {
  margin: 8px 0 10px;
}
.not-found-card > p {
  max-width: 39em;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
}
.not-found-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 24px;
}
@media (max-width: 520px) {
  .not-found-actions {
    flex-direction: column;
  }
  .not-found-actions > * {
    width: 100%;
  }
}
</style>
