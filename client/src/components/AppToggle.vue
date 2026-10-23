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
@reference "../styles/tailwind.css";

.app-toggle {
  @apply relative flex items-center gap-[13px] min-h-[60px] rounded-[11px] border px-[14px] py-3 cursor-pointer transition-colors;
  border-color: var(--line);
  background: var(--surface-2);
}

.app-toggle:hover:not(.is-disabled) {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--line));
}

.app-toggle-copy {
  @apply grid flex-1 gap-1 min-w-0;
}

.app-toggle-copy strong {
  @apply text-[11px] font-semibold;
  color: var(--text);
}

.app-toggle-copy small {
  @apply text-[10px] leading-normal;
  color: var(--muted);
}

.app-toggle-input {
  @apply absolute z-[1] top-1/2 right-[14px] w-[38px] h-[22px] m-0 opacity-0 cursor-pointer;
  transform: translateY(-50%);
}

.app-toggle-track {
  @apply relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors;
  background: var(--line);
}

.app-toggle-track::after {
  @apply absolute top-[3px] left-[3px] h-4 w-4 rounded-full transition-transform;
  background: var(--surface);
  box-shadow: 0 1px 3px #0002;
  content: "";
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
  @apply opacity-60 cursor-not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .app-toggle-track,
  .app-toggle-track::after {
    transition: none;
  }
}
</style>
