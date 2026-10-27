import type { AsyncRepository } from "./repositories";

/**
 * Public storage calls always settle asynchronously, including for memory and
 * the current synchronous SQLite driver. This keeps the API compatible with
 * genuinely asynchronous adapters without leaking driver types to services.
 */
export function asAsyncRepository<T extends object>(repository: T): AsyncRepository<T> {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        Promise.resolve().then(() => Reflect.apply(value, target, args));
    },
  }) as AsyncRepository<T>;
}
