<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  busyText?: string;
  tone?: "danger" | "warning";
  align?: "start" | "end";
  disabled?: boolean;
  busy?: boolean;
}>(), {
  confirmText: "确认",
  cancelText: "返回",
  busyText: "处理中…",
  tone: "danger",
  align: "end",
  disabled: false,
  busy: false,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();
const root = ref<HTMLElement | null>(null);
const placement = ref<"top" | "bottom">("bottom");

function toggle() {
  if (props.disabled || props.busy) return;
  const opening = !props.open;
  if (opening) {
    const rect = root.value?.getBoundingClientRect();
    placement.value = rect && rect.bottom + 190 > window.innerHeight ? "top" : "bottom";
  }
  emit("update:open", opening);
}
function close() {
  if (!props.busy) emit("update:open", false);
}
function onDocumentPointerDown(event: PointerEvent) {
  if (!root.value || root.value.contains(event.target as Node)) return;
  close();
}
function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !props.open || props.busy) return;
  event.preventDefault();
  close();
}
function attachListeners() {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);
}
function detachListeners() {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeyDown);
}
watch(() => props.open, (open) => {
  if (open) attachListeners();
  else detachListeners();
});
onMounted(() => { if (props.open) attachListeners(); });
onBeforeUnmount(detachListeners);
</script>

<template>
  <div ref="root" class="confirm-anchor" @click.stop>
    <slot name="trigger" :toggle="toggle" :open="props.open" />
    <div v-if="props.open" class="confirm-popover" :class="'confirm-' + props.tone" role="group" aria-label="确认操作" @click.stop>
      <strong>{{ props.title }}</strong>
      <span>{{ props.description }}</span>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel" :disabled="props.busy" @click="close">{{ props.cancelText }}</button>
        <button type="button" :class="props.tone === 'warning' ? 'confirm-warning' : 'confirm-danger'" :disabled="props.disabled || props.busy" @click="emit('confirm')">
          {{ props.busy ? props.busyText : props.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-anchor{position:relative;display:inline-block;max-width:100%}
.confirm-popover{position:absolute;z-index:40;right:0;top:calc(100% + 7px);width:min(285px,calc(100vw - 40px));padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:0 10px 30px rgba(0,0,0,.14);text-align:left}
.confirm-popover.align-start{left:0;right:auto}
.confirm-popover.placement-top{top:auto;bottom:calc(100% + 7px)}
.confirm-popover strong,.confirm-popover span{display:block}
.confirm-popover strong{color:var(--text);font-size:12px;line-height:1.5}
.confirm-popover span{margin-top:5px;color:var(--muted);font-size:11px;line-height:1.6;overflow-wrap:anywhere}
.confirm-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}
.confirm-actions button{min-height:30px;padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);color:var(--text);font:inherit;font-size:11px;font-weight:700;cursor:pointer}
.confirm-actions button:disabled{opacity:.5;cursor:not-allowed}
.confirm-actions .confirm-danger{background:var(--red);border-color:var(--red);color:white}
.confirm-actions .confirm-warning{background:var(--amber-soft,#fff3dc);border-color:color-mix(in srgb,var(--amber,#d97706) 40%,var(--line));color:var(--amber,#b45309)}
.confirm-warning:hover:not(:disabled){filter:brightness(.98)}
.confirm-danger:hover:not(:disabled){filter:brightness(.96)}
.confirm-cancel:focus-visible,.confirm-danger:focus-visible,.confirm-warning:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(max-width:480px){.confirm-popover{width:min(285px,calc(100vw - 36px))}}
</style>
