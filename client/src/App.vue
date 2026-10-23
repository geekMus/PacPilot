<script setup lang="ts">
import { useRoute } from "vue-router";
import AppScrollArea from "@/components/AppScrollArea.vue";
import ToastHost from "@/components/ToastHost.vue";

const route = useRoute();
</script>

<template>
  <div class="app-shell">
    <AppScrollArea
      v-if="route.meta.layout !== 'admin'"
      root-class="app-public-scroll"
      orientation="vertical"
    >
      <RouterView />
    </AppScrollArea>
    <RouterView v-else />
    <ToastHost />
  </div>
</template>

<style>
.app-shell {
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

.app-public-scroll {
  width: 100%;
  height: 100%;
}
</style>
