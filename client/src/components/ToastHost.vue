<script setup lang="ts">
import { useToast } from "../composables/useToast";
import AppIcon from "./AppIcon.vue";
const { toasts, dismiss } = useToast();
const iconNames = {
  success: "check-circle-2",
  error: "circle-x",
  info: "info",
  warning: "triangle-alert",
} as const;
</script>
<template>
  <div class="toast-host" aria-live="polite" aria-relevant="additions text" aria-label="操作提示">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="'toast-' + toast.kind"
        role="status"
      >
        <AppIcon :name="iconNames[toast.kind]" :size="18" />
        <span>{{ toast.message }}</span>
        <button type="button" aria-label="关闭提示" @click="dismiss(toast.id)">
          <AppIcon name="x" :size="15" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
<style scoped>
.toast-host {
  position: fixed;
  z-index: 9999;
  top: 18px;
  right: 18px;
  width: min(420px, calc(100vw - 36px));
  pointer-events: none;
}
.toast-stack {
  display: grid;
  gap: 10px;
}
.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 12px 34px #0002;
  font-size: 13px;
  line-height: 1.5;
  pointer-events: auto;
}
.toast-item > span {
  flex: 1;
  overflow-wrap: anywhere;
}
.toast-item button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.toast-success > :first-child {
  color: var(--green);
}
.toast-error > :first-child {
  color: var(--red);
}
.toast-warning > :first-child {
  color: var(--accent);
}
.toast-info > :first-child {
  color: var(--accent);
}
.toast-enter-active,
.toast-leave-active,
.toast-move {
  transition: all 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-leave-active {
  position: absolute;
  right: 0;
  left: 0;
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: none;
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
@media (max-width: 600px) {
  .toast-host {
    top: 10px;
    right: 10px;
    width: calc(100vw - 20px);
  }
}
</style>
