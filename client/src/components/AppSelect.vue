<script setup lang="ts">
import { computed } from "vue";
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";
import AppScrollArea from "@/components/AppScrollArea.vue";
import AppIcon from "@/components/AppIcon.vue";

export interface AppSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: AppSelectOption[];
    id?: string;
    placeholder?: string;
    block?: boolean;
    disabled?: boolean;
    invalid?: boolean;
  }>(),
  { placeholder: "", block: false, disabled: false, invalid: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: string | number];
}>();

const selectedValue = computed(() => String(props.modelValue ?? ""));
function onValueChange(value: string): void {
  const selected = props.options.find((option) => String(option.value) === value);
  if (selected) emit("update:modelValue", selected.value);
}
</script>

<template>
  <span class="app-select" :class="{ 'is-block': props.block }">
    <SelectRoot
      :modal="false"
      :model-value="selectedValue"
      :disabled="props.disabled"
      @update:model-value="onValueChange"
    >
      <SelectTrigger
        :id="props.id"
        class="app-select-trigger"
        :class="{ 'is-invalid': props.invalid }"
        :aria-invalid="props.invalid ? 'true' : undefined"
        :disabled="props.disabled"
      >
        <SelectValue :placeholder="props.placeholder" />
        <AppIcon class="app-select-chevron" name="chevron-down" :size="15" aria-hidden="true" />
      </SelectTrigger>
      <SelectPortal>
        <SelectContent
          class="app-select-content"
          position="popper"
          :side-offset="4"
          :collision-padding="8"
        >
          <AppScrollArea
            root-class="app-select-scroll-area"
            viewport-class="app-select-viewport"
            orientation="vertical"
            type="hover"
            overscroll="contain"
          >
            <template #viewport="{ viewportComponent, viewportClass, onScroll }">
              <SelectViewport as-child>
                <component
                  :is="viewportComponent"
                  :class="viewportClass"
                  @scroll.passive="onScroll"
                >
                  <SelectItem
                    v-for="option in props.options"
                    :key="String(option.value)"
                    :value="String(option.value)"
                    :disabled="option.disabled"
                    class="app-select-item"
                  >
                    <SelectItemText>{{ option.label }}</SelectItemText>
                    <SelectItemIndicator class="app-select-item-indicator">
                      <AppIcon name="check" :size="14" aria-hidden="true" />
                    </SelectItemIndicator>
                  </SelectItem>
                </component>
              </SelectViewport>
            </template>
          </AppScrollArea>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </span>
</template>

<style>
@reference "../styles/tailwind.css";

.app-select {
  @apply inline-flex min-w-0 max-w-full align-middle;
  width: max-content;
}
.app-select.is-block {
  @apply flex w-full;
}
.app-select-trigger {
  @apply box-border inline-flex w-full min-w-0 items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors;
  min-height: 40px;
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.app-select-trigger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}
.app-select-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.app-select-trigger[data-state="open"] {
  border-color: var(--accent);
}
.app-select-trigger.is-invalid {
  border-color: var(--red);
}
.app-select-trigger:disabled {
  @apply cursor-not-allowed;
  background: var(--control-disabled-bg);
  color: var(--control-disabled-text);
  border-color: var(--control-disabled-border);
}
.app-select-chevron {
  @apply shrink-0 transition-transform;
  color: var(--muted);
}
.app-select-trigger[data-state="open"] .app-select-chevron {
  color: var(--accent);
  transform: rotate(180deg);
}
.app-select-content {
  @apply z-[1200] box-border overflow-hidden rounded-[10px] border;
  min-width: min(var(--reka-select-trigger-width), calc(100vw - 16px));
  width: max-content;
  max-width: calc(100vw - 16px);
  max-height: var(--reka-select-content-available-height);
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.app-select-scroll-area {
  @apply w-full min-h-0 overflow-hidden;
  height: fit-content;
  max-height: min(360px, var(--reka-select-content-available-height, 360px));
}
.app-select-viewport {
  @apply w-full min-h-0 p-1;
  height: fit-content;
  max-height: min(360px, var(--reka-select-content-available-height, 360px));
}
.app-select-item {
  @apply relative box-border flex min-w-0 max-w-full items-center justify-between gap-3 rounded-md px-[9px] py-[7px] text-xs leading-snug outline-none cursor-pointer select-none;
  min-height: 34px;
  overflow-wrap: anywhere;
  color: var(--text);
}
.app-select-item[data-highlighted] {
  background: var(--accent-soft);
  color: var(--accent);
}
.app-select-item[data-state="checked"] {
  @apply font-semibold;
}
.app-select-item[data-disabled] {
  @apply cursor-not-allowed;
  color: var(--control-disabled-text);
}
.app-select-item-indicator {
  @apply inline-flex items-center;
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .app-select-trigger,
  .app-select-chevron {
    transition: none;
  }
}
</style>
