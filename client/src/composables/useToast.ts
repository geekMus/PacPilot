import { toast } from "vue-sonner";

export type ToastKind = "success" | "error" | "info" | "warning";

export function useToast() {
  function notify(message: string, kind: ToastKind = "info", duration = 4000) {
    const text = message.trim();
    if (!text) return;

    const options = { duration: duration > 0 ? duration : Infinity };

    switch (kind) {
      case "success":
        toast.success(text, options);
        break;
      case "error":
        toast.error(text, options);
        break;
      case "warning":
        toast.warning(text, options);
        break;
      default:
        toast.info(text, options);
    }
  }

  return { notify };
}
