import type { Database } from "bun:sqlite";
import type { NotificationDocument } from "../../../shared/contracts";
import type { SyncNotificationRepository } from "../repositories";
const empty = (): NotificationDocument => ({
  channels: [],
  rules: [],
  events: [],
  deliveries: [],
});
export function createSqliteNotificationRepository(db: Database): SyncNotificationRepository {
  return {
    get() {
      const row = db.query("SELECT value FROM settings WHERE key=?").get("notifications") as {
        value: string;
      } | null;
      if (!row) return empty();
      try {
        const v = JSON.parse(row.value) as Partial<NotificationDocument>;
        return {
          channels: Array.isArray(v.channels) ? v.channels : [],
          rules: Array.isArray(v.rules) ? v.rules : [],
          events: Array.isArray(v.events) ? v.events : [],
          deliveries: Array.isArray(v.deliveries) ? v.deliveries : [],
        };
      } catch {
        throw new Error("通知配置读取失败：数据库中的 notifications 记录不是合法的 JSON。");
      }
    },
    set(d) {
      db.query(
        "INSERT INTO settings(key,value) VALUES('notifications',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).run(JSON.stringify(d));
    },
  };
}
