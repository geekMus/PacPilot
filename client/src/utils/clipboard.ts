/**
 * Copy text to the system clipboard, with a legacy fallback for insecure HTTP
 * origins where the Clipboard API is unavailable.
 *
 * Keep browser-specific compatibility logic here so UI components only need
 * to handle the returned success/failure state.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue with the legacy fallback when permissions or secure-context
      // requirements prevent using the Clipboard API.
    }
  }

  return copyWithLegacyCommand(text);
}

function copyWithLegacyCommand(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  const textarea = document.createElement("textarea");
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.opacity = "0.01";

  // A modal <dialog> makes the rest of the document inert. Keep the temporary
  // textarea inside the open dialog so it can receive focus and be copied.
  const openDialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  const container = openDialog ?? document.body;
  container.appendChild(textarea);

  let copied = false;
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    // execCommand can misleadingly return true if the browser refused to
    // focus/select the temporary text, so verify those prerequisites first.
    if (
      document.activeElement === textarea &&
      textarea.selectionStart === 0 &&
      textarea.selectionEnd === text.length
    ) {
      copied = document.execCommand("copy");
    }
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }

  return copied;
}
