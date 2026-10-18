<script setup lang="ts">
import { useTheme, type ThemeMode } from "../composables/useTheme";
const { mode, setMode } = useTheme();
const options: { value: ThemeMode; label: string; title: string }[] = [
  { value: "system", label: "自动", title: "跟随系统" },
  { value: "light", label: "浅色", title: "浅色模式" },
  { value: "dark", label: "深色", title: "深色模式" },
];
</script>

<template>
  <div class="theme-switch" role="group" aria-label="主题切换">
    <button v-for="opt in options" :key="opt.value" type="button" class="theme-btn"
      :class="{ active: mode === opt.value }" :aria-pressed="mode === opt.value"
      :title="opt.title" @click="setMode(opt.value)">{{ opt.label }}</button>
  </div>
</template>

<style scoped>
.theme-switch { display:inline-flex; flex:0 0 auto; align-items:center; gap:2px; padding:3px; border:1px solid var(--line); border-radius:10px; background:var(--surface); }
.theme-btn { appearance:none; border:0; background:transparent; color:var(--muted); min-height:29px; padding:0 9px; border-radius:7px; font-size:11px; font-weight:650; line-height:1; cursor:pointer; white-space:nowrap; }
.theme-btn.active { background:var(--accent-soft); color:var(--accent); }
.theme-btn:hover { color:var(--text); }
@media(max-width:400px) { .theme-btn { min-height:32px; padding:0 12px; } }
</style>
