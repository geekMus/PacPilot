<script setup lang="ts">
defineProps<{
  brand?: string;
  sub?: string;
}>();
</script>

<template>
  <header class="topbar">
    <div class="brand">
      {{ brand || "genpac-runner" }}
      <small v-if="sub">{{ sub }}</small>
    </div>
    <nav class="nav">
      <slot />
    </nav>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 34px;
  padding-right: 140px;
}
.brand {
  font-weight: 750;
  letter-spacing: 0.02em;
}
.brand small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
}
.nav {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 14px;
}
@media (max-width: 700px) {
  .topbar {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-right: 0;
    padding-top: 36px;
  }
}
</style>
