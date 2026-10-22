import { onScopeDispose, ref } from "vue";
import { copyText } from "@/utils/clipboard";

export type CopyButtonState = "success" | "error" | null;

const FEEDBACK_DURATION_MS = 1800;

/** Keep transient copy feedback on the action button itself. */
export function useCopyFeedback() {
  const copyState = ref<CopyButtonState>(null);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;

  function resetCopyState(): void {
    requestId += 1;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = undefined;
    copyState.value = null;
  }

  async function copyWithFeedback(text: string): Promise<boolean> {
    const currentRequest = ++requestId;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = undefined;

    let succeeded = false;
    try {
      succeeded = await copyText(text);
    } catch {
      succeeded = false;
    }

    if (currentRequest !== requestId) return succeeded;

    copyState.value = succeeded ? "success" : "error";
    resetTimer = setTimeout(() => {
      if (currentRequest === requestId) copyState.value = null;
      resetTimer = undefined;
    }, FEEDBACK_DURATION_MS);

    return succeeded;
  }

  onScopeDispose(() => {
    if (resetTimer) clearTimeout(resetTimer);
  });

  return { copyState, copyWithFeedback, resetCopyState };
}
