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
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  padding-right: min(148px, 30vw);
}

.brand .name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  display: block;
}

.brand small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  max-width: 100%;
}

/* 插槽内链接/按钮统一成胶囊按钮 */
.nav :deep(a),
.nav :deep(button.linkish),
.nav :deep(.nav-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
  appearance: none;
  font-family: inherit;
}

.nav :deep(a:hover),
.nav :deep(button.linkish:hover),
.nav :deep(.nav-btn:hover) {
  background: var(--surface-2);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  color: var(--accent);
  text-decoration: none;
}

.nav :deep(a.primary),
.nav :deep(.nav-btn.primary) {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.nav :deep(a.primary:hover),
.nav :deep(.nav-btn.primary:hover) {
  filter: brightness(1.05);
  color: #fff;
}

@media (max-width: 720px) {
  .topbar {
    flex-direction: column;
    align-items: stretch;
    padding-right: 0;
    padding-top: 48px;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .nav {
    justify-content: flex-start;
  }
}
</style>
