import { reactive } from "vue";
export type ToastKind = "success" | "error" | "info" | "warning";
export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}
const state = reactive<{ items: ToastMessage[] }>({ items: [] });
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
export function useToast() {
  function dismiss(id: number) {
    const index = state.items.findIndex((item) => item.id === id);
    if (index >= 0) state.items.splice(index, 1);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }
  function notify(message: string, kind: ToastKind = "info", duration = 4000) {
    const text = message.trim();
    if (!text) return;
    const id = nextId++;
    state.items.push({ id, kind, message: text });
    if (state.items.length > 5) dismiss(state.items[0].id);
    if (duration > 0)
      timers.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
  }
  return { toasts: state.items, notify, dismiss };
}
