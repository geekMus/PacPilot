/**
 * Copy text via the async Clipboard API. Requires a secure context
 * (HTTPS or localhost); on plain HTTP deployments the API is missing and
 * copying reports failure through the returned boolean.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Permissions, focus loss, or secure-context requirements can reject the write.
    return false;
  }
}
