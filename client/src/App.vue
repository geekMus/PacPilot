<script setup lang="ts">
import ToastHost from "@/components/ToastHost.vue";
</script>
<template>
  <div class="app-shell"><RouterView /><ToastHost /></div>
</template>
<style>
.app-shell {
  min-height: 100vh;
}
</style>
