<script setup lang="ts">
import AppIcon from "@/components/AppIcon.vue";

withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { disabled: false, ariaLabel: "" }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();
</script>

<template>
  <span class="app-checkbox" :class="{ 'is-checked': modelValue, 'is-disabled': disabled }">
    <input
      class="app-checkbox-input"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="app-checkbox-box" aria-hidden="true">
      <AppIcon name="check" :size="11" />
    </span>
  </span>
</template>

<style>
@reference "../styles/tailwind.css";

.app-checkbox {
  @apply relative inline-grid h-4 w-4 shrink-0 place-items-center;
}

.app-checkbox-input {
  @apply absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0;
}

.app-checkbox-box {
  @apply grid h-4 w-4 place-items-center rounded-[5px] border text-transparent transition-colors;
  border-color: var(--line);
  background: var(--surface);
}

.app-checkbox:hover:not(.is-disabled) .app-checkbox-box {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}

.app-checkbox.is-checked .app-checkbox-box {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.app-checkbox-input:focus-visible + .app-checkbox-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.app-checkbox.is-disabled {
  @apply cursor-not-allowed opacity-55;
}

.app-checkbox.is-disabled .app-checkbox-input {
  @apply cursor-not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .app-checkbox-box {
    transition: none;
  }
}
</style>
