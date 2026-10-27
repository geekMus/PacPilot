<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import AppScrollArea from "@/components/AppScrollArea.vue";
import { subscribeToastRuntime } from "@/composables/toast-bridge";

// Toast 组件（含 vue-sonner，约 36KB）只在第一条提示出现后才挂载，
// 不占用任何页面的首屏关键路径。
const ToastHost = defineAsyncComponent(() => import("@/components/ToastHost.vue"));

const toastRuntimeReady = ref(false);
const unsubscribe = subscribeToastRuntime((loaded) => {
  toastRuntimeReady.value = loaded;
});
onBeforeUnmount(() => {
  unsubscribe();
});

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
    <ToastHost v-if="toastRuntimeReady" />
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
