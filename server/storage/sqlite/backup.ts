import fs from "node:fs";
import path from "node:path";
import type { AppDatabase } from "./database";

const BACKUP_DIRECTORY_NAME = "backups";
const MAX_BACKUPS = 5;
const BACKUP_FILE_PATTERN = /^database\.v\d+-.*\.db$/;

function backupDirectory(dataDir: string): string {
  return path.join(dataDir, BACKUP_DIRECTORY_NAME);
}

/**
 * Writes a consistent pre-migration snapshot of the database via `VACUUM INTO`
 * (a standalone, compacted copy that is safe under WAL without checkpointing)
 * and prunes older backups beyond the retention limit. Returns the absolute
 * path of the new backup file; failures leave the live database untouched.
 */
export function createMigrationBackup(
  database: AppDatabase,
  dataDir: string,
  fromVersion: number
): string {
  const directory = backupDirectory(dataDir);
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let fileName = `database.v${fromVersion}-${stamp}.db`;
  let suffix = 0;
  while (fs.existsSync(path.join(directory, fileName))) {
    suffix += 1;
    fileName = `database.v${fromVersion}-${stamp}-${suffix}.db`;
  }
  const backupPath = path.join(directory, fileName);
  database.query("VACUUM INTO ?").run(backupPath);
  pruneBackups(directory);
  return backupPath;
}

/** Keeps only the newest MAX_BACKUPS migration backups in the backups directory. */
function pruneBackups(directory: string): void {
  const backups = fs
    .readdirSync(directory)
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    fs.rmSync(path.join(directory, name), { force: true });
  }
}
