<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Toaster, toast } from "vue-sonner";

const { locale } = useI18n();
const theme = ref<"light" | "dark">("light");
let themeObserver: MutationObserver | undefined;

function syncTheme() {
  theme.value = document.documentElement.classList.contains("theme-dark") ? "dark" : "light";
}

onMounted(() => {
  syncTheme();
  themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
});

watch(locale, () => {
  toast.dismiss();
});

const toastOptions = {
  // 视觉（底色/边框/文字颜色）统一在下方样式块按 data-type 定义，
  // 不放行内样式，否则会盖掉按类型着色的规则。
  style: {
    fontFamily: "var(--font)",
  },
};
</script>

<template>
  <Toaster
    :theme="theme"
    position="top-center"
    :visible-toasts="5"
    :toast-options="toastOptions"
    close-button
  />
</template>

<style scoped>
@reference "@/styles/tailwind.css";

:deep([data-sonner-toaster][data-x-position="center"]) {
  @apply max-w-[calc(100vw-32px)] font-sans;
  width: min(420px, calc(100vw - 32px)) !important;
}

:deep([data-sonner-toast]) {
  @apply box-border w-full max-w-full tracking-[0.01em];
  overflow-wrap: anywhere;
  white-space: pre-line;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
:deep([data-sonner-toast][data-type="success"]) {
  border-color: color-mix(in srgb, var(--green) 35%, var(--line));
  background: var(--green-soft);
  color: var(--green);
}
:deep([data-sonner-toast][data-type="error"]) {
  border-color: color-mix(in srgb, var(--red) 35%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
:deep([data-sonner-toast][data-type="warning"]) {
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft);
  color: var(--warn);
}

:deep([data-sonner-toast] [data-close-button]) {
  left: auto !important;
  right: 0 !important;
  transform: translate(35%, -35%) !important;
}

@media (max-width: 600px) {
  :deep([data-sonner-toaster][data-x-position="center"]) {
    @apply max-w-[calc(100vw-24px)];
    width: calc(100vw - 24px) !important;
  }
}
</style>
