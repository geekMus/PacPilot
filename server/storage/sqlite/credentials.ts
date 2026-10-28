import type { Database } from "bun:sqlite";
import type { AdminCredentialRecord, SyncAdminCredentialRepository } from "../repositories";
import { t } from "../../../shared/i18n";

/** SQLite persistence adapter for administrator credentials. */
export class SqliteAdminCredentialRepository implements SyncAdminCredentialRepository {
  constructor(private readonly database: Database) {}

  get(): AdminCredentialRecord | null {
    const row = this.database
      .query("SELECT value FROM settings WHERE key = ?")
      .get("admin-auth") as { value: string } | null;
    if (!row) return null;
    let value: Partial<AdminCredentialRecord>;
    try {
      value = JSON.parse(row.value) as Partial<AdminCredentialRecord>;
    } catch {
      throw new Error(t("zh_CN", "storageErrors.corruptCredentials"));
    }
    if (
      typeof value.passwordHash !== "string" ||
      typeof value.salt !== "string" ||
      typeof value.sessionSecret !== "string"
    ) {
      throw new Error(t("zh_CN", "storageErrors.corruptCredentials"));
    }
    return {
      passwordHash: value.passwordHash,
      salt: value.salt,
      sessionSecret: value.sessionSecret,
    };
  }

  set(record: AdminCredentialRecord): void {
    this.database
      .query(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run("admin-auth", JSON.stringify(record));
  }
}
