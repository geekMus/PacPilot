<script setup lang="ts">
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";

withDefaults(defineProps<{ block?: boolean }>(), { block: false });

const isOpen = ref(false);
</script>

<template>
  <span
    class="select-field"
    :class="{ 'is-block': block, 'is-open': isOpen }"
    @focusin="isOpen = true"
    @focusout="isOpen = false"
    @change="isOpen = false"
    @keydown.esc="isOpen = false"
  >
    <slot />
    <AppIcon class="select-field-icon" name="chevron-down" :size="15" />
  </span>
</template>

<style scoped>
.select-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  min-width: 0;
  max-width: 100%;
  width: max-content;
}
.select-field.is-block {
  display: flex;
  width: 100%;
}
.select-field :deep(select) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 38px;
  flex: 1 1 auto;
  appearance: none;
  -webkit-appearance: none;
  padding: 9px 36px 9px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background-color: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  background-image: none;
  cursor: pointer;
}
.select-field :deep(select:disabled) {
  cursor: not-allowed;
}
.select-field-icon {
  position: absolute;
  z-index: 1;
  right: 10px;
  top: 50%;
  color: var(--muted);
  pointer-events: none;
  transform: translateY(-50%) rotate(0deg);
  transform-origin: center;
  transition: transform 180ms ease, color 180ms ease;
}
.select-field.is-open .select-field-icon {
  color: var(--accent);
  transform: translateY(-50%) rotate(180deg);
}
.select-field:focus-within :deep(select) {
  border-color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .select-field-icon { transition: none; }
}
</style>
