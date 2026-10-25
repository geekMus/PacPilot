<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { useRoute } from "vue-router";
import AppScrollArea from "@/components/AppScrollArea.vue";

// Toast 组件（含 vue-sonner，约 36KB）仅在第一条 toast 出现时才加载，
// 不占用任何页面的首屏关键路径。
const ToastHost = defineAsyncComponent(() => import("@/components/ToastHost.vue"));

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
