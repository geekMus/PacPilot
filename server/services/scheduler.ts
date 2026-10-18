import cron, { type ScheduledTask } from "node-cron";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { generatePac } from "./pac-generator";

let currentTask: ScheduledTask | null = null;
let currentExpr = "";

export function reschedule(
  database: AppDatabase,
  dataDir: string
): void {
  const settings = getSettings(database);
  const expr = settings.cronSchedule.trim();

  if (currentTask && currentExpr === expr) {
    return;
  }

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentExpr = "";
    console.log("[cron] previous schedule stopped");
  }

  if (!expr) {
    console.log("[cron] no schedule configured");
    return;
  }

  if (!cron.validate(expr)) {
    console.error(`[cron] invalid expression: ${expr}`);
    return;
  }

  currentTask = cron.schedule(expr, () => {
    console.log(`[cron] triggered: ${expr}`);
    void generatePac(database, dataDir);
  });
  currentExpr = expr;
  console.log(`[cron] scheduled: ${expr}`);
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentExpr = "";
  }
}
