import type { ArtifactStorage, KeyValueStorage, StorageContext } from "./contracts";

function cloneValue<T>(value: T): T {
  // Storage values are JSON-shaped application data; clone on both read and
  // write so callers cannot mutate state without going through the adapter.
  return structuredClone(value);
}

function artifactKey(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("Artifact key must be a non-empty relative path without traversal segments.");
  }
  return normalized;
}

export class MemoryKeyValueStorage implements KeyValueStorage {
  private readonly namespaces = new Map<string, Map<string, unknown>>();

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const value = this.namespaces.get(namespace)?.get(key);
    return value === undefined ? undefined : cloneValue(value as T);
  }

  async set<T>(namespace: string, key: string, value: T): Promise<void> {
    let entries = this.namespaces.get(namespace);
    if (!entries) {
      entries = new Map<string, unknown>();
      this.namespaces.set(namespace, entries);
    }
    entries.set(key, cloneValue(value));
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    const entries = this.namespaces.get(namespace);
    if (!entries) return false;
    const deleted = entries.delete(key);
    if (entries.size === 0) this.namespaces.delete(namespace);
    return deleted;
  }

  async entries<T>(namespace: string): Promise<Array<[string, T]>> {
    return Array.from(this.namespaces.get(namespace)?.entries() ?? [], ([key, value]) => [
      key,
      cloneValue(value as T),
    ]);
  }

  async clear(namespace: string): Promise<number> {
    const entries = this.namespaces.get(namespace);
    if (!entries) return 0;
    const size = entries.size;
    this.namespaces.delete(namespace);
    return size;
  }
}

export class MemoryArtifactStorage implements ArtifactStorage {
  private readonly artifacts = new Map<string, Uint8Array>();

  async read(key: string): Promise<Uint8Array | undefined> {
    const contents = this.artifacts.get(artifactKey(key));
    return contents ? new Uint8Array(contents) : undefined;
  }

  async write(key: string, contents: Uint8Array | string): Promise<void> {
    const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
    this.artifacts.set(artifactKey(key), new Uint8Array(bytes));
  }

  async delete(key: string): Promise<boolean> {
    return this.artifacts.delete(artifactKey(key));
  }

  async exists(key: string): Promise<boolean> {
    return this.artifacts.has(artifactKey(key));
  }

  async list(prefix = ""): Promise<string[]> {
    const normalizedPrefix = prefix ? artifactKey(prefix) : "";
    return Array.from(this.artifacts.keys())
      .filter((key) => key.startsWith(normalizedPrefix))
      .sort();
  }
}

/** Creates isolated, process-local storage. Nothing is persisted on close. */
export function createMemoryStorage(): StorageContext {
  return {
    driver: "memory",
    values: new MemoryKeyValueStorage(),
    artifacts: new MemoryArtifactStorage(),
    async close() {
      // Releasing the context drops all references; process memory is the store.
    },
  };
}
