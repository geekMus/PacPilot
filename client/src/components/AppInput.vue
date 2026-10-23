<script setup lang="ts">
import { ref } from "vue";
withDefaults(defineProps<{
  modelValue: string;
  type?: string;
  placeholder?: string;
  autocomplete?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}>(), {
  type: "text",
  placeholder: "",
  autocomplete: "off",
  required: false,
  disabled: false,
  invalid: false,
});

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
.app-input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--control-border, var(--line));
  border-radius: 8px;
  color: var(--text);
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.app-input::placeholder {
  color: var(--muted);
  opacity: 0.8;
}
.app-input:hover:not(:disabled):not(:focus) {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}
.app-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
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
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .app-input { transition: none; }
}
</style>
