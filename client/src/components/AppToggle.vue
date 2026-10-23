<script setup lang="ts">
import { useId } from "vue";

withDefaults(
  defineProps<{
    modelValue: boolean;
    label?: string;
    description?: string;
    disabled?: boolean;
  }>(),
  { label: "", description: "", disabled: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const fieldId = useId();
</script>

<template>
  <label class="app-toggle" :class="{ 'is-disabled': disabled }" :for="fieldId">
    <span v-if="label || description || $slots.label || $slots.description" class="app-toggle-copy">
      <slot name="label">
        <strong>{{ label }}</strong>
      </slot>
      <slot name="description">
        <small v-if="description">{{ description }}</small>
      </slot>
    </span>
    <input
      :id="fieldId"
      class="app-toggle-input"
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :disabled="disabled"
      :aria-checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="app-toggle-track" aria-hidden="true"></span>
  </label>
</template>

<style>
.app-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 60px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}

.app-toggle:hover:not(.is-disabled) {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--line));
}

.app-toggle-copy {
  display: grid;
  flex: 1 1 auto;
  gap: 4px;
  min-width: 0;
}

.app-toggle-copy strong {
  color: var(--text);
  font-size: 11px;
  font-weight: 680;
}

.app-toggle-copy small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

.app-toggle-input {
  position: absolute;
  z-index: 1;
  top: 50%;
  right: 14px;
  width: 38px;
  height: 22px;
  margin: 0;
  opacity: 0;
  transform: translateY(-50%);
  cursor: pointer;
}

.app-toggle-track {
  position: relative;
  flex: 0 0 38px;
  width: 38px;
  height: 22px;
  border-radius: 99px;
  background: var(--line);
  transition: background 160ms ease;
}

.app-toggle-track::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px #0002;
  content: "";
  transition: transform 160ms ease;
}

.app-toggle-input:checked + .app-toggle-track {
  background: var(--accent);
}

.app-toggle-input:checked + .app-toggle-track::after {
  transform: translateX(16px);
}

.app-toggle-input:focus-visible + .app-toggle-track {
  outline: 3px solid var(--accent-soft);
  outline-offset: 2px;
}

.app-toggle.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .app-toggle-track,
  .app-toggle-track::after {
    transition: none;
  }
}
</style>
