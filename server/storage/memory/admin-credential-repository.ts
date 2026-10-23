import type { AdminCredentialRecord, AdminCredentialRepository } from "../repositories";

/** Process-local credential adapter; state disappears when this instance is discarded. */
export class MemoryAdminCredentialRepository implements AdminCredentialRepository {
  private record: AdminCredentialRecord | null = null;

  get(): AdminCredentialRecord | null {
    return this.record ? structuredClone(this.record) : null;
  }

  set(record: AdminCredentialRecord): void {
    this.record = structuredClone(record);
  }

  clear(): void {
    this.record = null;
  }
}
