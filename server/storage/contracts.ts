/**
 * Storage contracts shared by persistent and ephemeral storage adapters.
 *
 * Business services should depend on these interfaces instead of a concrete
 * database or filesystem API. Methods are asynchronous so adapters can be
 * swapped without leaking driver-specific behavior into route handlers.
 */

export interface KeyValueStorage {
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  set<T>(namespace: string, key: string, value: T): Promise<void>;
  delete(namespace: string, key: string): Promise<boolean>;
  entries<T>(namespace: string): Promise<Array<[key: string, value: T]>>;
  clear(namespace: string): Promise<number>;
}

export interface ArtifactStorage {
  read(key: string): Promise<Uint8Array | undefined>;
  write(key: string, contents: Uint8Array | string): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

export interface StorageContext {
  readonly driver: "sqlite" | "memory";
  readonly values: KeyValueStorage;
  readonly artifacts: ArtifactStorage;
  close(): Promise<void>;
}
