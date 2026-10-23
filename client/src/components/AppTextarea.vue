<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  resize?: "none" | "vertical" | "horizontal" | "both";
}>(), {
  placeholder: "",
  rows: 3,
  required: false,
  disabled: false,
  invalid: false,
  resize: "vertical",
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  input: [event: Event];
}>();

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
  emit("input", event);
}
</script>

<template>
  <textarea
    v-bind="$attrs"
    class="app-textarea"
    :class="{ 'is-invalid': invalid }"
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows"
    :required="required"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    :style="{ resize }"
    @input="onInput"
  />
</template>

<style>
.app-textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 88px;
  padding: 9px 12px;
  border: 1px solid var(--control-border, var(--line));
  border-radius: 8px;
  color: var(--text);
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.app-textarea::placeholder {
  color: var(--muted);
  opacity: 0.8;
}
.app-textarea:hover:not(:disabled):not(:focus) {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}
.app-textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: var(--accent);
}
.app-textarea.is-invalid,
.app-textarea.is-invalid:focus-visible {
  border-color: var(--red);
}
.app-textarea:disabled {
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .app-textarea { transition: none; }
}
</style>
