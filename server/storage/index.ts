import type { EnvConfig } from "../config/env";
import { getDb } from "../db/sqlite";
import type { ApplicationStorage } from "./repositories";
import { createMemoryApplicationStorage } from "./memory-application";
import { createSqliteApplicationStorage } from "./sqlite-repositories";

/** Single composition point for the two supported storage modes. */
export function createApplicationStorage(env: Pick<EnvConfig, "storageDriver" | "dataDir">): ApplicationStorage {
  if (env.storageDriver === "memory") return createMemoryApplicationStorage();
  return createSqliteApplicationStorage(getDb(env.dataDir), env.dataDir);
}
