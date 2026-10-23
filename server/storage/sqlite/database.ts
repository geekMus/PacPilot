import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, normalizeAppSettings } from "../../domain/settings";
import { initializeSchema } from "./schema";

/** The concrete database type is confined to the SQLite adapter. */
export type AppDatabase = Database;

let db: AppDatabase | null = null;

export function createDatabase(dataDir: string): AppDatabase {
  const inMemory = dataDir === ":memory:";
  if (!inMemory) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = inMemory ? dataDir : path.join(dataDir, "database.db");
  const database = new Database(dbPath, { create: true });
  try {
    database.run("PRAGMA journal_mode = WAL;");
    database.run("PRAGMA foreign_keys = ON;");
    initializeSchema(database, () => {
      const normalized = normalizeAppSettings(DEFAULT_SETTINGS);
      database
        .query("INSERT INTO settings (key, value) VALUES ('config', ?)")
        .run(JSON.stringify(normalized));
    });
    return database;
  } catch (error) {
    try {
      database.close();
    } catch {
      /* initialization may already have closed the connection */
    }
    throw error;
  }
}

export function getDb(dataDir: string): AppDatabase {
  if (db) return db;
  db = createDatabase(dataDir);
  return db;
}

export function closeDb(): void {
  if (!db) return;
  db.close();
  db = null;
}
