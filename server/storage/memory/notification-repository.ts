import type { NotificationDocument } from "../../../shared/contracts";
import type { SyncNotificationRepository } from "../repositories";
const empty = (): NotificationDocument => ({
  schemaVersion: 1,
  legacyMigrated: false,
  channels: [],
  rules: [],
  events: [],
  deliveries: [],
});
export function createMemoryNotificationRepository(): SyncNotificationRepository & {
  reset(): void;
} {
  let d = empty();
  return {
    get: () => structuredClone(d),
    set(v) {
      d = structuredClone(v);
    },
    reset() {
      d = empty();
    },
  };
}
