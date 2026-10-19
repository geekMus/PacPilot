<script setup lang="ts">
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";
const isOpen = ref(false);
</script>

<template>
  <span class="select-field" :class="{ 'is-open': isOpen }" @focusin="isOpen = true" @focusout="isOpen = false" @change="isOpen = false" @keydown.esc="isOpen = false">
    <slot />
    <AppIcon class="select-field-icon" name="chevron-down" :size="15" />
  </span>
</template>

<style scoped>
.select-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  vertical-align: middle;
}
.select-field :deep(select) {
  appearance: none;
  -webkit-appearance: none;
  max-width: 100%;
  padding-right: 34px !important;
}
.select-field-icon {
  position: absolute;
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
@media (prefers-reduced-motion: reduce) {
  .select-field-icon { transition: none; }
}
</style>
