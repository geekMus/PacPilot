<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    title?: string;
  }>(),
  {
    size: 32,
    title: "PacPilot",
  }
);
</script>

<template>
  <svg
    class="brand-mark-svg"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    role="img"
    :aria-label="title"
  >
    <title>{{ title }}</title>
    <rect width="32" height="32" rx="8" fill="#3556d8" />
    <circle cx="12" cy="16" r="2.75" fill="#ffffff" />
    <path d="M5 16h4.2" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" />
    <path
      d="M14.2 14.6c2.2-2.8 5.4-4.2 9.3-4.2"
      fill="none"
      stroke="#ffffff"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <path
      d="M21.4 8.2l2.4 2.2 2.2-2.6"
      fill="none"
      stroke="#ffffff"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M14.2 17.4c2.2 2.8 5.4 4.2 9.3 4.2"
      fill="none"
      stroke="#ffffff"
      stroke-width="2.2"
      stroke-linecap="round"
      opacity="0.85"
    />
    <circle cx="25.2" cy="21.6" r="1.9" fill="#ffffff" opacity="0.9" />
  </svg>
</template>

<style scoped>
.brand-mark-svg {
  display: block;
  flex: 0 0 auto;
  border-radius: 22%;
  /* Soft edge on light surfaces without a second colored plate behind the mark. */
  box-shadow:
    0 1px 2px rgba(26, 35, 50, 0.06),
    0 4px 12px rgba(53, 86, 216, 0.18);
}
</style>
