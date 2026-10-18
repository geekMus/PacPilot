<script setup lang="ts">
import ThemeSwitcher from "./components/ThemeSwitcher.vue";
</script>

<template>
  <div class="app-shell">
    <ThemeSwitcher />
    <router-view />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}
</style>
