import type { Database } from "bun:sqlite";
import type { AdminCredentialRecord, AdminCredentialRepository } from "../repositories";

/** SQLite persistence adapter for administrator credentials. */
export class SqliteAdminCredentialRepository implements AdminCredentialRepository {
  constructor(private readonly database: Database) {}

  get(): AdminCredentialRecord | null {
    const row = this.database.query("SELECT value FROM settings WHERE key = ?").get("admin-auth") as
      | { value: string }
      | null;
    if (!row) return null;
    try {
      const value = JSON.parse(row.value) as Partial<AdminCredentialRecord>;
      if (
        typeof value.passwordHash !== "string" ||
        typeof value.salt !== "string" ||
        typeof value.sessionSecret !== "string"
      ) return null;
      return {
        passwordHash: value.passwordHash,
        salt: value.salt,
        sessionSecret: value.sessionSecret,
      };
    } catch {
      return null;
    }
  }

  set(record: AdminCredentialRecord): void {
    this.database
      .query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("admin-auth", JSON.stringify(record));
  }
}
