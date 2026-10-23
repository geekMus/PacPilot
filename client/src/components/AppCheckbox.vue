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
.app-checkbox {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 16px;
  height: 16px;
}

.app-checkbox-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.app-checkbox-box {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: transparent;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
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
  opacity: 0.55;
  cursor: not-allowed;
}

.app-checkbox.is-disabled .app-checkbox-input {
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .app-checkbox-box {
    transition: none;
  }
}
</style>
