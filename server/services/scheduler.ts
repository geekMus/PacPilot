import cron, { type ScheduledTask } from "node-cron";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { hasActivePacWorkflow, runPacWorkflow } from "./workflow";
import { runtimeLog } from "../utils/runtime-log";

let currentTask: ScheduledTask | null = null;
let currentKey = "";
let scheduledRunInFlight = false;

export function reschedule(database: AppDatabase, dataDir: string): void {
  const settings = getSettings(database);
  const expression = settings.cronSchedule.trim();
  const key = expression + "\n" + settings.timezone;

  if (currentTask && currentKey === key) return;

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
    runtimeLog("log", "已停止之前的定时任务。");
  }

  if (!expression) {
    runtimeLog("log", "未配置定时任务。");
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
        runtimeLog("warn", "上一次工作流尚未结束，跳过本次定时触发，避免任务积压。");
        return;
      }

      scheduledRunInFlight = true;
      runtimeLog("log", `定时任务已触发：${expression}（时区：${settings.timezone}）`);

      void runPacWorkflow(database, dataDir, "scheduled")
        .catch((error) => runtimeLog("error", "定时任务工作流失败：", error))
        .finally(() => {
          scheduledRunInFlight = false;
        });
    },
    { timezone: settings.timezone }
  );

  currentKey = key;
  runtimeLog("log", `已安排定时任务：${expression}（时区：${settings.timezone}）`);
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }
}
