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
@reference "../styles/tailwind.css";

.app-textarea {
  @apply block w-full min-w-0 min-h-[88px] rounded-lg border px-3 py-2 text-xs leading-normal transition-colors;
  border-color: var(--control-border, var(--line));
  color: var(--text);
  background: var(--surface);
}

.app-textarea::placeholder {
  @apply opacity-80;
  color: var(--muted);
}

.app-textarea:hover:not(:disabled):not(:focus) {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}

.app-textarea:focus-visible {
  @apply outline-2 outline-offset-1;
  outline-color: var(--accent);
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
  @apply cursor-not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .app-textarea {
    transition: none;
  }
}
</style>
