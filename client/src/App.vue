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
@reference "@/styles/tailwind.css";

.app-shell {
  @apply h-dvh w-full overflow-hidden;
}

.app-public-scroll {
  @apply h-full w-full;
}
</style>
