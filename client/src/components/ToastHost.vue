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
  style: {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow)",
    fontFamily: "var(--font)",
    width: "100%",
    maxWidth: "100%",
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
:deep([data-sonner-toaster][data-x-position="center"]) {
  width: min(420px, calc(100vw - 32px)) !important;
  max-width: calc(100vw - 32px);
  font-family: var(--font);
}

:deep([data-sonner-toast]) {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-wrap: anywhere;
  letter-spacing: 0.01em;
}

:deep([data-sonner-toast] [data-close-button]) {
  left: auto !important;
  right: 0 !important;
  transform: translate(35%, -35%) !important;
}

@media (max-width: 600px) {
  :deep([data-sonner-toaster][data-x-position="center"]) {
    width: calc(100vw - 24px) !important;
    max-width: calc(100vw - 24px);
  }
}
</style>
