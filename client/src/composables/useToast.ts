import { enqueueToast } from "@/composables/toast-bridge";

export type ToastKind = "success" | "error" | "info" | "warning";

export function useToast() {
  function notify(message: string, kind: ToastKind = "info", duration = 4000) {
    const text = message.trim();
    if (!text) return;

    // 先排队再由运行时投递：vue-sonner 只在第一次提示时下载，首屏不为它付费。
    enqueueToast({ message: text, kind, duration: duration > 0 ? duration : Infinity });
  }

  return { notify };
}
