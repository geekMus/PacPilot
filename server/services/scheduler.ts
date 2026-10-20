import cron, { type ScheduledTask } from "node-cron";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { runPacWorkflow } from "./workflow";
import { runtimeLog } from "../utils/runtime-log";
let currentTask: ScheduledTask | null = null,
  currentKey = "";
export function reschedule(database: AppDatabase, dataDir: string): void {
  const s = getSettings(database),
    expr = s.cronSchedule.trim(),
    key = expr + "\n" + s.timezone;
  if (currentTask && currentKey === key) return;
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
    runtimeLog("log", "已停止之前的定时任务。");
  }
  if (!expr) {
    runtimeLog("log", "未配置定时任务。");
    return;
  }
  if (!cron.validate(expr)) {
    runtimeLog("error", `定时任务表达式无效：${expr}`);
    return;
  }
  currentTask = cron.schedule(
    expr,
    () => {
      runtimeLog("log", `定时任务已触发：${expr}（时区：${s.timezone}）`);
      void runPacWorkflow(database, dataDir, "scheduled").catch((error) =>
        runtimeLog("error", "定时任务工作流失败：", error)
      );
    },
    { timezone: s.timezone }
  );
  currentKey = key;
  runtimeLog("log", `已安排定时任务：${expr}（时区：${s.timezone}）`);
}
export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentKey = "";
  }
}
