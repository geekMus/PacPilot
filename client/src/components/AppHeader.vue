<script setup lang="ts">
defineProps<{
  brand?: string;
  sub?: string;
}>();
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="name">{{ brand || "genpac-runner" }}</span>
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
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  /* room for fixed theme switcher on desktop */
  padding-right: min(150px, 28vw);
}

.brand .name {
  font-weight: 750;
  letter-spacing: 0.02em;
  display: block;
}

.brand small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 16px;
  font-size: 14px;
  max-width: 100%;
}

.nav :deep(a),
.nav :deep(button.linkish) {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
}

@media (max-width: 720px) {
  .topbar {
    flex-direction: column;
    align-items: stretch;
    padding-right: 0;
    padding-top: 48px; /* theme switcher */
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .nav {
    justify-content: flex-start;
    gap: 10px 14px;
  }
}
</style>
