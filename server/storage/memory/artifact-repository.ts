import { normalizeArtifactKey } from "../artifact-key";

export function createMemoryArtifactRepository() {
  const files = new Map<string, { bytes: Uint8Array; modifiedAt: string }>();
  return {
    read(key: string) {
      const item = files.get(normalizeArtifactKey(key));
      return item ? new Uint8Array(item.bytes) : undefined;
    },
    write(key: string, contents: Uint8Array | string) {
      const bytes =
        typeof contents === "string"
          ? new TextEncoder().encode(contents)
          : new Uint8Array(contents);
      files.set(normalizeArtifactKey(key), { bytes, modifiedAt: new Date().toISOString() });
    },
    delete(key: string) {
      return files.delete(normalizeArtifactKey(key));
    },
    exists(key: string) {
      return files.has(normalizeArtifactKey(key));
    },
    list(prefix = "") {
      const normalized = prefix ? normalizeArtifactKey(prefix) : "";
      return [...files.keys()].filter((key) => key.startsWith(normalized)).sort();
    },
    stat(key: string) {
      const item = files.get(normalizeArtifactKey(key));
      if (!item) return undefined;
      return { size: item.bytes.byteLength, modifiedAt: item.modifiedAt };
    },
    totalBytes() {
      return [...files.values()].reduce((sum, item) => sum + item.bytes.byteLength, 0);
    },
    clear() {
      files.clear();
    },
  };
}
