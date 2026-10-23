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
  ScrollAreaRoot,
  ScrollAreaViewport,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
} from "reka-ui";
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
          <ScrollAreaRoot class="app-select-scroll-area" type="auto">
            <SelectViewport as-child>
              <ScrollAreaViewport class="app-select-viewport">
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
              </ScrollAreaViewport>
            </SelectViewport>
            <ScrollAreaScrollbar class="app-scrollbar" orientation="vertical">
              <ScrollAreaThumb class="app-scrollbar-thumb" />
            </ScrollAreaScrollbar>
          </ScrollAreaRoot>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </span>
</template>

<style>
.app-select {
  display: inline-flex;
  vertical-align: middle;
  min-width: 0;
  max-width: 100%;
  width: max-content;
}
.app-select.is-block {
  display: flex;
  width: 100%;
}
.app-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
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
  background: var(--control-disabled-bg);
  color: var(--control-disabled-text);
  border-color: var(--control-disabled-border);
  cursor: not-allowed;
}
.app-select-chevron {
  flex: 0 0 auto;
  color: var(--muted);
  transition: transform 160ms ease, color 160ms ease;
}
.app-select-trigger[data-state="open"] .app-select-chevron {
  color: var(--accent);
  transform: rotate(180deg);
}
.app-select-content {
  z-index: 1200;
  box-sizing: border-box;
  min-width: min(var(--reka-select-trigger-width), calc(100vw - 16px));
  width: max-content;
  max-width: calc(100vw - 16px);
  max-height: var(--reka-select-content-available-height);
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.app-select-scroll-area {
  width: 100%;
  max-height: var(--reka-select-content-available-height);
  overflow: hidden;
}
.app-select-viewport {
  width: 100%;
  height: 100%;
  max-height: var(--reka-select-content-available-height);
  padding: 4px;
}
.app-select-item {
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 7px 9px;
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
  outline: none;
  cursor: pointer;
  user-select: none;
}
.app-select-item[data-highlighted] {
  background: var(--accent-soft);
  color: var(--accent);
}
.app-select-item[data-state="checked"] {
  font-weight: 650;
}
.app-select-item[data-disabled] {
  color: var(--control-disabled-text);
  cursor: not-allowed;
}
.app-select-item-indicator {
  display: inline-flex;
  align-items: center;
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .app-select-trigger,
  .app-select-chevron {
    transition: none;
  }
}
</style>