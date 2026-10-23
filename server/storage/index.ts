import type { EnvConfig } from "../config/env";
import type { ApplicationStorage } from "./repositories";
import { createMemoryApplicationStorage } from "./memory-application";

/** Selects a storage adapter without loading SQLite in database-free mode. */
export async function createApplicationStorage(
  env: Pick<EnvConfig, "storageDriver" | "dataDir">
): Promise<ApplicationStorage> {
  if (env.storageDriver === "memory") return createMemoryApplicationStorage();

  const [{ getDb }, { createSqliteApplicationStorage }] = await Promise.all([
    import("./sqlite/sqlite"),
    import("./sqlite/repositories"),
  ]);
  return createSqliteApplicationStorage(getDb(env.dataDir), env.dataDir);
}
