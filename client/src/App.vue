<script setup lang="ts">
import { useRoute } from "vue-router";
import AppScrollArea from "@/components/AppScrollArea.vue";
import ToastHost from "@/components/ToastHost.vue";

const route = useRoute();
</script>

<template>
  <div class="app-shell">
    <RouterView v-slot="{ Component }">
      <AppScrollArea
        v-if="route.meta.layout !== 'admin'"
        root-class="app-public-scroll"
        orientation="vertical"
      >
        <component :is="Component" />
      </AppScrollArea>
      <component :is="Component" v-else />
    </RouterView>
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
