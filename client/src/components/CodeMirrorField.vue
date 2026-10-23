<script setup lang="ts">
import MonacoEditorField from "@/components/MonacoEditorField.vue";
const props = withDefaults(defineProps<{
  modelValue: string; placeholder?: string; height?: number; singleLine?: boolean;
  language?: "json" | "text"; ariaLabel?: string; invalid?: boolean;
}>(), { placeholder: "", height: 160, singleLine: false, language: "text", ariaLabel: "", invalid: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>
<template>
  <MonacoEditorField :model-value="props.modelValue" :placeholder="props.placeholder" :height="props.height"
    :single-line="props.singleLine" :language="props.language" :aria-label="props.ariaLabel"
    :invalid="props.invalid" @update:model-value="emit('update:modelValue', $event)" />
</template>
