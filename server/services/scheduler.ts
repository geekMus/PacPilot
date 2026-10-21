import cron, { type ScheduledTask } from "node-cron";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { hasActivePacWorkflow, runPacWorkflow } from "./workflow";
import { runtimeLog } from "../utils/runtime-log";

let currentTask: ScheduledTask | null = null;
let currentKey = "";
let scheduledRunInFlight = false;
let overlapWarningLogged = false;

export function reschedule(database: AppDatabase, dataDir: string): void {
  const settings = getSettings(database);
  const expression = settings.cronSchedule.trim();
  const key = expression + "\n" + settings.timezone;

  if (currentTask && currentKey === key) return;

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }

  if (!expression) {
    return;
  }

  if (!cron.validate(expression)) {
    runtimeLog("error", `定时任务表达式无效：${expression}`);
    return;
  }

  currentTask = cron.schedule(
    expression,
    () => {
      if (scheduledRunInFlight || hasActivePacWorkflow(database)) {
        if (!overlapWarningLogged) {
          runtimeLog("warn", "上一次工作流尚未结束，跳过本次定时触发，避免任务积压。");
          overlapWarningLogged = true;
        }
        return;
      }

      overlapWarningLogged = false;
      scheduledRunInFlight = true;

      void runPacWorkflow(database, dataDir, "scheduled")
        .catch((error) => runtimeLog("error", "定时任务工作流失败：", error))
        .finally(() => {
          scheduledRunInFlight = false;
        });
    },
    { timezone: settings.timezone }
  );

  currentKey = key;
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }
}
