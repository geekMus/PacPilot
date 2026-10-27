<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    size?: "sm" | "md";
    danger?: boolean;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  { size: "md", danger: false, type: "button", disabled: false }
);

const classes = computed(() => [
  "app-icon-button",
  props.size === "sm" ? "app-icon-button--sm" : "",
  props.danger ? "app-icon-button--danger" : "",
]);
</script>

<template>
  <button :type="type" :class="classes" :aria-label="label" :title="label" :disabled="disabled">
    <slot />
  </button>
</template>
