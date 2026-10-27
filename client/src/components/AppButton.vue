<script setup lang="ts">
import { computed } from "vue";

type ButtonVariant = "primary" | "secondary" | "danger" | "danger-ghost";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: "sm" | "md";
    block?: boolean;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    variant: "secondary",
    size: "md",
    block: false,
    type: "button",
    disabled: false,
  }
);

const classes = computed(() => [
  "app-button",
  `app-button--${props.variant}`,
  props.size !== "md" ? `app-button--${props.size}` : "",
  props.block ? "app-button--block" : "",
]);
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
