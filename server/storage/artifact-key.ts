/** Validates and canonicalizes an artifact key shared by every storage adapter. */
export function normalizeArtifactKey(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Artifact key must be a safe relative path.");
  }
  return normalized;
}
