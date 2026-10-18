<script setup lang="ts">
import ThemeSwitcher from "./ThemeSwitcher.vue";

defineProps<{ brand?: string; sub?: string }>();
</script>

<template>
  <header class="topbar">
    <RouterLink class="brand" to="/" aria-label="genpac-runner 运行概览">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="8.5"/><path d="M3.8 9h16.4M3.8 15h16.4M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17"/>
        </svg>
      </span>
      <span class="brand-copy">
        <span class="name">{{ brand || "genpac-runner" }}</span>
        <small v-if="sub">{{ sub }}</small>
      </span>
    </RouterLink>
    <div class="header-tools">
      <nav class="nav" aria-label="主导航"><slot /></nav>
      <ThemeSwitcher />
    </div>
  </header>
</template>

<style scoped>
.topbar { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:var(--space-5); }
.brand { display:flex; align-items:center; gap:10px; color:var(--text); text-decoration:none; flex:0 0 auto; }
.brand-mark { display:grid; place-items:center; width:36px; height:36px; border:1px solid var(--line); border-radius:11px; background:var(--surface); color:var(--accent); }
.brand-copy .name { display:block; font-size:14px; font-weight:750; letter-spacing:-.02em; }
.brand-copy small { display:block; margin-top:1px; color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
.header-tools { display:flex; align-items:center; justify-content:flex-end; gap:12px; min-width:0; }
.nav { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:7px; }
.nav :deep(a),.nav :deep(button.linkish) { display:inline-flex; align-items:center; justify-content:center; min-height:35px; padding:0 12px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--text); font-size:12px; font-weight:650; text-decoration:none; white-space:nowrap; cursor:pointer; }
.nav :deep(a:hover),.nav :deep(button.linkish:hover) { border-color:color-mix(in srgb,var(--accent) 40%,var(--line)); color:var(--accent); }
.nav :deep(a.primary) { background:var(--accent); border-color:var(--accent); color:var(--accent-contrast); }
.nav :deep(a.primary:hover) { filter:brightness(1.05); color:var(--accent-contrast); }
@media(max-width:720px) { .topbar { align-items:flex-start; flex-direction:column; gap:14px; } .header-tools { width:100%; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; } .nav { justify-content:flex-start; } }
@media(max-width:400px) { .header-tools { flex-direction:column; } }
</style>
