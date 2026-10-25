<script setup lang="ts">
import { ref } from "vue";
withDefaults(
  defineProps<{
    modelValue: string;
    type?: string;
    placeholder?: string;
    autocomplete?: string;
    required?: boolean;
    disabled?: boolean;
    invalid?: boolean;
  }>(),
  {
    type: "text",
    placeholder: "",
    autocomplete: "off",
    required: false,
    disabled: false,
    invalid: false,
  }
);

const inputElement = ref<HTMLInputElement | null>(null);

function focus(options?: FocusOptions): void {
  inputElement.value?.focus(options);
}

function getInputElement(): HTMLInputElement | null {
  return inputElement.value;
}

defineExpose({ focus, getInputElement });

const emit = defineEmits<{
  "update:modelValue": [value: string];
  input: [event: Event];
}>();

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
  emit("input", event);
}
</script>

<template>
  <input
    ref="inputElement"
    v-bind="$attrs"
    class="app-input"
    :class="{ 'is-invalid': invalid }"
    :value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :required="required"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="onInput"
  />
</template>

<style>
@reference "@/styles/tailwind.css";

.app-input {
  @apply block w-full min-w-0 min-h-10 rounded-lg border px-3 py-2 text-xs leading-snug transition-colors;
  border-color: var(--control-border, var(--line));
  color: var(--text);
  background: var(--surface);
}

.app-input::placeholder {
  @apply opacity-80;
  color: var(--muted);
}

.app-input:hover:not(:disabled):not(:focus) {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}

.app-input:focus-visible {
  @apply outline-2 outline-offset-1;
  outline-color: var(--accent);
  border-color: var(--accent);
}

.app-input.is-invalid,
.app-input.is-invalid:focus-visible {
  border-color: var(--red);
}

.app-input:disabled {
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  @apply cursor-not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .app-input {
    transition: none;
  }
}
</style>
